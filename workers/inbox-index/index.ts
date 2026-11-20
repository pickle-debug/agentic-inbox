import type { InboxSummary } from "../../shared/mailbox-summary";
import type { Env } from "../types";
import type { IndexedMailbox } from "./store";

const EMPTY: InboxSummary = {unreadCount: 0, latestDate: null, latestSubject: null};
// Keeps a cold-index request well under the Workers subrequest limit; the rest fill on later polls.
const BACKFILL_PER_REQUEST = 100;

/** null only where the binding is absent (older test harnesses); deployments always bind it. */
export const inboxIndex = (env: Env) => env.INBOX_INDEX ? env.INBOX_INDEX.get(env.INBOX_INDEX.idFromName("index")) : null;
/** Rows are keyed by MAILBOX Durable Object id, which each mailbox can also derive for itself. */
export const inboxIndexKey = (env: Env, mailboxId: string) => env.MAILBOX.idFromName(mailboxId).toString();

async function inBatches<T, R>(items: T[], size: number, run: (item: T) => Promise<R>) {
	const results: R[] = [];
	for (let i = 0; i < items.length; i += size) results.push(...await Promise.all(items.slice(i, i + size).map(run)));
	return results;
}

/** null = unknown right now (retry on a later poll); "" = the mailbox has no display name. */
async function settingsName(env: Env, mailboxId: string): Promise<string | null> {
	let object: R2ObjectBody | null;
	try {
		object = await env.BUCKET.get(`mailboxes/${mailboxId}.json`);
	} catch {
		return null; // Transient storage error: try again on a later poll.
	}
	if (!object) return null;
	try {
		const settings = await object.json<{fromName?: unknown}>();
		return typeof settings?.fromName === "string" ? settings.fromName.trim() : "";
	} catch {
		return ""; // Bad display metadata must not hide otherwise readable mail.
	}
}

/**
 * Badge data for mailboxes the caller is already allowed to see: one index read per poll. Only
 * mailboxes the index has never heard from (created before it existed, or after a lost update)
 * are asked directly, a bounded number per request.
 */
export async function mailboxSummaries<T extends {id: string; name: string}>(env: Env, mailboxes: T[]): Promise<(T & InboxSummary)[]> {
	if (!mailboxes.length) return [];
	const index = inboxIndex(env);
	const keys = new Map(mailboxes.map(mailbox => [mailbox.id, inboxIndexKey(env, mailbox.id)]));
	let indexed: Record<string, IndexedMailbox> = {};
	if (index) {
		try {
			indexed = await index.read([...keys.values()]);
		} catch (err) {
			console.error("Inbox index read failed; asking mailboxes directly", err);
		}
	}
	const entry = (id: string): IndexedMailbox | undefined => indexed[keys.get(id)!];

	const unseen = mailboxes.filter(mailbox => !entry(mailbox.id)?.summary).slice(0, BACKFILL_PER_REQUEST);
	const reported = new Map(await inBatches(unseen, 10, async mailbox => {
		try {
			// The mailbox publishes through its own ordered queue, so this cannot overwrite a newer push.
			return [mailbox.id, await env.MAILBOX.get(env.MAILBOX.idFromName(mailbox.id)).syncInboxSummary()] as const;
		} catch (err) {
			// One unavailable mailbox must not blank the whole list; it is retried on the next poll.
			console.error("Inbox summary failed", mailbox.id, err);
			return [mailbox.id, EMPTY] as const;
		}
	}));

	const unnamed = mailboxes.filter(mailbox => entry(mailbox.id)?.name == null).slice(0, BACKFILL_PER_REQUEST);
	const names = new Map<string, string>();
	for (const [id, name] of await inBatches(unnamed, 10, async mailbox => [mailbox.id, await settingsName(env, mailbox.id)] as const)) {
		if (name !== null) names.set(id, name);
	}
	if (index && names.size) {
		try {
			await index.setNames(Object.fromEntries([...names].map(([id, name]) => [keys.get(id)!, name])), true);
		} catch (err) {
			console.error("Inbox index name backfill failed", err);
		}
	}

	return mailboxes.map(mailbox => {
		const summary = reported.get(mailbox.id) ?? entry(mailbox.id)?.summary ?? EMPTY;
		const name = names.get(mailbox.id) ?? entry(mailbox.id)?.name;
		return {...mailbox, name: name || mailbox.name, unreadCount: summary.unreadCount, latestDate: summary.latestDate, latestSubject: summary.latestSubject};
	});
}

/** Keep badge names current after a settings save. If this fails, the old name stays until the next save. */
export async function rememberMailboxName(env: Env, mailboxId: string, fromName: unknown) {
	const index = inboxIndex(env);
	if (!index) return;
	try {
		await index.setNames({[inboxIndexKey(env, mailboxId)]: typeof fromName === "string" ? fromName.trim() : ""});
	} catch (err) {
		console.error("Inbox index name update failed", mailboxId, err);
	}
}
