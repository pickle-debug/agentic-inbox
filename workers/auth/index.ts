import { Hono, type Context } from "hono";
import { createMiddleware } from "hono/factory";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { bodyLimit } from "hono/body-limit";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import type { Env } from "../types";

export type Identity = { role: "admin" | "mailbox"; email: string; expires: number };
export type AuthContext = { Bindings: Env; Variables: { identity: Identity } };
export const authStore = (env: Env) => env.AUTH.get(env.AUTH.idFromName("auth"));
const cookieName = (url: string) => new URL(url).protocol === "https:" ? "__Host-inbox_session" : "inbox_session";
const setSessionCookie = (c: Context<AuthContext>, result: { token: string; maxAge: number }) => setCookie(c, cookieName(c.req.url), result.token, { httpOnly: true, secure: new URL(c.req.url).protocol === "https:", sameSite: "Strict", path: "/", maxAge: result.maxAge });
const tokenFrom = (c: Parameters<typeof getCookie>[0]) => getCookie(c, cookieName(c.req.url));
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function adminOrigin(env: Env) {
	if (!env.ADMIN_ORIGIN) return null;
	const url = new URL(env.ADMIN_ORIGIN);
	if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("ADMIN_ORIGIN must be an HTTPS origin");
	return url.origin;
}

async function accessIdentity(c: Context<AuthContext>): Promise<Identity | null> {
	const assertion = c.req.header("cf-access-jwt-assertion");
	const { POLICY_AUD, TEAM_DOMAIN } = c.env;
	const allowedOrigin = adminOrigin(c.env);
	if (!assertion || !POLICY_AUD || !TEAM_DOMAIN || (allowedOrigin && allowedOrigin !== new URL(c.req.url).origin)) return null;
	const issuer = new URL(TEAM_DOMAIN).origin;
	if (!issuer.startsWith("https://")) return null;
	let jwks = jwksCache.get(issuer);
	if (!jwks) { jwks = createRemoteJWKSet(new URL("/cdn-cgi/access/certs", issuer)); jwksCache.set(issuer, jwks); }
	const { payload } = await jwtVerify(assertion, jwks, { issuer, audience: POLICY_AUD, algorithms: ["RS256"] });
	if (typeof payload.email !== "string" || !z.string().email().safeParse(payload.email).success || payload.type !== "app" || typeof payload.exp !== "number") return null;
	return { role: "admin", email: payload.email.toLowerCase(), expires: payload.exp * 1000 };
}

async function revokeSession(c: Context<AuthContext>) {
	const token = tokenFrom(c);
	if (!token) return null;
	const session = await authStore(c.env).session(token);
	await authStore(c.env).logout(token);
	if (session?.role === "mailbox") await c.env.EMAIL_AGENT.get(c.env.EMAIL_AGENT.idFromName(session.email)).disconnectClients();
	return session;
}

export function authentication(development = false) {
	return createMiddleware<AuthContext>(async (c, next) => {
		c.header("Cache-Control", "no-store");
		const path = c.req.path;
		const origin = new URL(c.req.url).origin;
		const isWrite = !["GET", "HEAD", "OPTIONS"].includes(c.req.method);
		const isSocket = c.req.header("upgrade")?.toLowerCase() === "websocket";
		// MCP Access clients are authenticated using the assertion, not an app cookie.
		const isMcp = path === "/mcp" || path.startsWith("/mcp/");
		if ((isWrite || isSocket) && !(isMcp && !c.req.header("origin") && !tokenFrom(c))) {
			if (c.req.header("origin") !== origin) return c.json({ error: "请求来源不匹配。" }, 403);
		}
		if (path === "/login" || path === "/auth/login" || path === "/auth/config" || path === "/auth/logout" || path === "/auth/admin/session") return next();
		const token = tokenFrom(c);
		if (token) {
			const session = await authStore(c.env).session(token);
			if (session && (session.role === "admin" || await c.env.BUCKET.head(`mailboxes/${session.email}.json`))) c.set("identity", session);
			// A stale mailbox cookie must never silently become an administrator.
		} else if (development && c.env.DEV_ADMIN_EMAIL) {
			c.set("identity", { role: "admin", email: c.env.DEV_ADMIN_EMAIL, expires: Date.now() + 8 * 3600_000 });
		} else {
			try {
				const identity = await accessIdentity(c);
				if (identity) c.set("identity", identity);
			} catch { return c.json({ error: "Invalid or expired Access token" }, 403); }
		}
		if (!c.var.identity) {
			if (path.startsWith("/api/") || path.startsWith("/auth/") || isMcp || path.startsWith("/agents/")) return c.json({ error: "请先登录。" }, 401);
			return c.redirect("/login");
		}
		if (isMcp && c.var.identity.role !== "admin") return c.json({ error: "仅管理员可以使用 MCP。" }, 403);
		return next();
	});
}

export const authRoutes = new Hono<AuthContext>();
authRoutes.use("/auth/login", bodyLimit({ maxSize: 2048 }));
authRoutes.get("/auth/config", (c) => c.json({ adminLoginUrl: `${adminOrigin(c.env) ?? new URL(c.req.url).origin}/auth/admin/session` }));
authRoutes.get("/auth/session", (c) => c.json(c.var.identity));
// Cloudflare Access must protect this exact path. The Worker still verifies the
// assertion: an unprotected/misconfigured callback cannot mint an admin session.
authRoutes.get("/auth/admin/session", async (c) => {
	let identity: Identity | null;
	try { identity = await accessIdentity(c); }
	catch { return c.json({ error: "Invalid or expired Access token" }, 403); }
	if (!identity) return c.json({ error: "管理员入口未通过 Cloudflare Access 验证，请检查该路径的 Access 配置。" }, 403);
	await revokeSession(c);
	setSessionCookie(c, await authStore(c.env).adminSession(identity.email, identity.expires));
	return c.redirect("/");
});

authRoutes.post("/auth/login", async (c) => {
	const parsed = z.object({ email: z.string().trim().email().max(254).transform(v => v.toLowerCase()), password: z.string().min(1).max(128) }).safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return c.json({ error: "请输入有效的邮箱和密码。" }, 400);
	const { email, password } = parsed.data;
	const result = await authStore(c.env).login(email, password, c.req.header("cf-connecting-ip") ?? "local");
	if ("error" in result) return c.json({ error: result.error === "limited" ? "尝试次数过多，请 15 分钟后重试。" : "邮箱或密码不正确。" }, result.error === "limited" ? 429 : 401);
	if (!(await c.env.BUCKET.head(`mailboxes/${email}.json`))) {
		await authStore(c.env).logout(result.token);
		return c.json({ error: "邮箱或密码不正确。" }, 401);
	}
	await revokeSession(c);
	setSessionCookie(c, result);
	return c.json({ role: "mailbox", email });
});
authRoutes.post("/auth/logout", async (c) => {
	const token = tokenFrom(c);
	const session = await revokeSession(c);
	deleteCookie(c, cookieName(c.req.url), { path: "/", secure: new URL(c.req.url).protocol === "https:" });
	return c.json({ redirect: session?.role === "admin" || (!token && c.req.header("cf-access-jwt-assertion")) ? "/cdn-cgi/access/logout" : "/login" });
});
