import { DurableObject } from "cloudflare:workers";
import type { Contact, ContactInput, ContactList } from "../../shared/contacts";
import type { Env } from "../types";

// ponytail: one shared directory for a small team; shard only if directory traffic grows.
export class ContactsStore extends DurableObject<Env> {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS contacts (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			email TEXT NOT NULL UNIQUE,
			notes TEXT NOT NULL DEFAULT '',
			introduction TEXT NOT NULL DEFAULT '',
			createdAt TEXT NOT NULL,
			updatedAt TEXT NOT NULL
		)`);
	}

	list(q: string, page: number, limit: number): ContactList {
		// instr treats percent signs and underscores literally rather than as LIKE wildcards.
		const where = "WHERE instr(lower(name), lower(?)) > 0 OR instr(lower(email), lower(?)) > 0 OR instr(lower(notes), lower(?)) > 0 OR instr(lower(introduction), lower(?)) > 0";
		const args = [q, q, q, q];
		const totalCount = this.ctx.storage.sql.exec<{ count: number }>(`SELECT COUNT(*) AS count FROM contacts ${where}`, ...args).one().count;
		const contacts = this.ctx.storage.sql.exec<Contact>(`SELECT * FROM contacts ${where} ORDER BY name COLLATE NOCASE, email, id LIMIT ? OFFSET ?`, ...args, limit, (page - 1) * limit).toArray();
		return { contacts, totalCount };
	}

	create(input: ContactInput): Contact | null {
		const now = new Date().toISOString();
		// The unique constraint owns duplicate detection, including concurrent requests.
		return this.ctx.storage.sql.exec<Contact>(
			"INSERT INTO contacts (id, name, email, notes, introduction, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(email) DO NOTHING RETURNING *",
			crypto.randomUUID(), input.name, input.email.trim().toLowerCase(), input.notes, input.introduction, now, now,
		).toArray()[0] ?? null;
	}

	update(id: string, input: ContactInput): { contact: Contact } | { error: "missing" | "duplicate" } {
		return this.ctx.storage.transactionSync(() => {
			if (!this.ctx.storage.sql.exec("SELECT id FROM contacts WHERE id = ?", id).toArray().length) return { error: "missing" as const };
			const email = input.email.trim().toLowerCase();
			if (this.ctx.storage.sql.exec("SELECT id FROM contacts WHERE email = ? AND id != ?", email, id).toArray().length) return { error: "duplicate" as const };
			const contact = this.ctx.storage.sql.exec<Contact>(
				"UPDATE contacts SET name = ?, email = ?, notes = ?, introduction = ?, updatedAt = ? WHERE id = ? RETURNING *",
				input.name, email, input.notes, input.introduction, new Date().toISOString(), id,
			).one();
			return { contact };
		});
	}

	remove(id: string): boolean {
		return this.ctx.storage.sql.exec("DELETE FROM contacts WHERE id = ? RETURNING id", id).toArray().length > 0;
	}
}
