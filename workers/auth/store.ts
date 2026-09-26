import { DurableObject } from "cloudflare:workers";
import { Buffer } from "node:buffer";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { Env } from "../types";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const derive = (password: string, salt: string) => scryptSync(password, salt, 32, { N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024 });
const SESSION_MS = 8 * 60 * 60 * 1000;

// ponytail: one small-team auth store; shard by mailbox if authentication traffic grows.
export class AuthStore extends DurableObject<Env> {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS credentials (email TEXT PRIMARY KEY, salt TEXT NOT NULL, digest TEXT NOT NULL)`);
		ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, email TEXT NOT NULL, expires INTEGER NOT NULL, role TEXT NOT NULL DEFAULT 'mailbox')`);
		if (!ctx.storage.sql.exec<{ name: string }>("PRAGMA table_info(sessions)").toArray().some(column => column.name === "role")) {
			ctx.storage.sql.exec("ALTER TABLE sessions ADD COLUMN role TEXT NOT NULL DEFAULT 'mailbox'");
		}
		ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL)`);
	}
	status(email: string) {
		return { enabled: this.ctx.storage.sql.exec("SELECT email FROM credentials WHERE email = ?", email).toArray().length > 0 };
	}
	setPassword(email: string, password: string) {
		if (password.length < 12 || password.length > 128) throw new Error("密码长度必须为 12–128 个字符。");
		const salt = randomBytes(16).toString("hex");
		const digest = derive(password, salt).toString("hex");
		this.ctx.storage.transactionSync(() => {
			this.ctx.storage.sql.exec("INSERT OR REPLACE INTO credentials VALUES (?, ?, ?)", email, salt, digest);
			this.ctx.storage.sql.exec("DELETE FROM sessions WHERE email = ? AND role = 'mailbox'", email);
		});
		return { enabled: true };
	}
	disable(email: string) {
		this.ctx.storage.transactionSync(() => {
			this.ctx.storage.sql.exec("DELETE FROM credentials WHERE email = ?", email);
			this.ctx.storage.sql.exec("DELETE FROM sessions WHERE email = ? AND role = 'mailbox'", email);
		});
		return { enabled: false };
	}
	#verifyPassword(email: string, password: string, ip: string): { error: "limited" | "invalid" } | { ok: true } {
		const now = Date.now();
		this.ctx.storage.sql.exec("DELETE FROM attempts WHERE expires <= ?", now);
		this.ctx.storage.sql.exec("DELETE FROM sessions WHERE expires <= ?", now);
		// Count all attempts before hashing; synchronous SQL prevents concurrent bypass.
		const limits: [string, number][] = [[`email:${hash(email)}`, 10], [`ip:${hash(ip)}`, 50]];
		for (const [key, limit] of limits) {
			const rows = this.ctx.storage.sql.exec<{ count: number }>("SELECT count FROM attempts WHERE key = ?", key).toArray();
			if ((rows[0]?.count ?? 0) >= limit) return { error: "limited" as const };
		}
		for (const [key] of limits) this.ctx.storage.sql.exec("INSERT INTO attempts VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1", key, now + 15 * 60 * 1000);
		const record = this.ctx.storage.sql.exec<{ salt: string; digest: string }>("SELECT salt, digest FROM credentials WHERE email = ?", email).toArray()[0];
		// Unknown accounts perform the same expensive operation and return the same error.
		const candidate = derive(password, record?.salt ?? "00000000000000000000000000000000");
		const matches = timingSafeEqual(candidate, Buffer.from(record?.digest ?? "00".repeat(32), "hex"));
		if (!record || !matches) return { error: "invalid" as const };
		return { ok: true as const };
	}
	login(email: string, password: string, ip: string) {
		const result = this.#verifyPassword(email, password, ip);
		if ("error" in result) return result;
		const token = randomBytes(32).toString("hex");
		this.ctx.storage.sql.exec("INSERT INTO sessions VALUES (?, ?, ?, ?)", hash(token), email, Date.now() + SESSION_MS, "mailbox");
		return { token, maxAge: SESSION_MS / 1000 };
	}
	changePassword(email: string, currentPassword: string, password: string, ip: string) {
		const result = this.#verifyPassword(email, currentPassword, ip);
		if ("error" in result) return result;
		this.setPassword(email, password);
		return { ok: true as const };
	}
	session(token: string) {
		if (!/^[a-f0-9]{64}$/.test(token)) return null;
		return this.ctx.storage.sql.exec<{ email: string; expires: number; role: "admin" | "mailbox" }>("SELECT email, expires, role FROM sessions WHERE token = ? AND expires > ?", hash(token), Date.now()).toArray()[0] ?? null;
	}
	adminSession(email: string, accessExpires: number) {
		const expires = Math.min(accessExpires, Date.now() + SESSION_MS);
		const maxAge = Math.floor((expires - Date.now()) / 1000);
		if (!email || !Number.isFinite(expires) || maxAge <= 0) throw new Error("Expired Access identity");
		this.ctx.storage.sql.exec("DELETE FROM sessions WHERE expires <= ?", Date.now());
		const token = randomBytes(32).toString("hex");
		this.ctx.storage.sql.exec("INSERT INTO sessions VALUES (?, ?, ?, ?)", hash(token), email, expires, "admin");
		return { token, maxAge };
	}
	logout(token: string) { this.ctx.storage.sql.exec("DELETE FROM sessions WHERE token = ?", hash(token)); }
}
