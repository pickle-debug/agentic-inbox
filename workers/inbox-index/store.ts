import { DurableObject } from "cloudflare:workers";
import type { InboxSummary } from "../../shared/mailbox-summary";
import type { Env } from "../types";

/** `summary` is null until the mailbox has reported; `name` is null until known ("" = no display name). */
export type IndexedMailbox = { summary: InboxSummary | null; name: string | null };

type Row = {
	mailbox: string;
	unread_count: number | null;
	latest_date: string | null;
	latest_subject: string | null;
	summary_at: number | null;
	name: string | null;
};

// ponytail: one shared index for a small team; shard by domain only if badge traffic grows.
/**
 * Inbox badge index, one row per MAILBOX Durable Object (keyed by its id string). Each mailbox
 * pushes its own Inbox summary after every write, so a badge refresh reads this single object
 * instead of calling every mailbox.
 */
export class InboxIndex extends DurableObject<Env> {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS inbox_summaries (
			mailbox TEXT PRIMARY KEY,
			unread_count INTEGER,
			latest_date TEXT,
			latest_subject TEXT,
			summary_at INTEGER,
			name TEXT
		)`);
	}

	/** Only the mailbox itself calls this, from its ordered publish queue, so the latest call wins. */
	putSummary(mailbox: string, summary: InboxSummary) {
		this.ctx.storage.sql.exec(
			`INSERT INTO inbox_summaries (mailbox, unread_count, latest_date, latest_subject, summary_at) VALUES (?, ?, ?, ?, ?)
			ON CONFLICT(mailbox) DO UPDATE SET unread_count = excluded.unread_count, latest_date = excluded.latest_date,
				latest_subject = excluded.latest_subject, summary_at = excluded.summary_at`,
			mailbox, summary.unreadCount, summary.latestDate, summary.latestSubject, Date.now(),
		);
	}

	/** Settings edits overwrite names; lazy backfill only fills gaps, so it can never undo an edit. */
	setNames(names: Record<string, string>, onlyMissing = false) {
		for (const [mailbox, name] of Object.entries(names)) {
			this.ctx.storage.sql.exec(
				`INSERT INTO inbox_summaries (mailbox, name) VALUES (?, ?)
				ON CONFLICT(mailbox) DO UPDATE SET name = excluded.name${onlyMissing ? " WHERE name IS NULL" : ""}`,
				mailbox, name,
			);
		}
	}

	read(mailboxes: string[]): Record<string, IndexedMailbox> {
		// json_each avoids SQLite's bound-parameter limit for large mailbox lists.
		const rows = this.ctx.storage.sql.exec<Row>(
			"SELECT * FROM inbox_summaries WHERE mailbox IN (SELECT value FROM json_each(?))",
			JSON.stringify(mailboxes),
		).toArray();
		return Object.fromEntries(rows.map(row => [row.mailbox, {
			summary: row.summary_at === null ? null : {unreadCount: row.unread_count ?? 0, latestDate: row.latest_date, latestSubject: row.latest_subject},
			name: row.name,
		}]));
	}
}
