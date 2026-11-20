// Local-only harness; never deployed. Incoming mail and auth storage use production code.
import handler from "./forwarding-worker";
import { AuthStore as BaseAuthStore } from "./auth-worker";
import { MailboxDO as ProductionMailboxDO } from "../workers/durableObject";
import { InboxIndex as ProductionInboxIndex } from "../workers/inbox-index/store";
export { EmailAgent, ContactsStore } from "./auth-worker";
import type { Env } from "../workers/types";
const sent: Record<string, unknown>[] = [];
export class AuthStore extends BaseAuthStore {
	expireShare(id: string) {
		this.ctx.storage.sql.exec(
			"UPDATE share_keys SET expires = ? WHERE id = ?",
			Date.now() - 1000,
			id,
		);
	}
	digests() {
		return this.ctx.storage.sql.exec("SELECT token_hash FROM share_keys").toArray();
	}
}
export class MailboxDO extends ProductionMailboxDO {
	/** Changes mail without the publish hook, to prove badge polling never asks mailboxes directly. */
	markInboxReadSilently() {
		this.ctx.storage.sql.exec("UPDATE emails SET read = 1 WHERE folder_id = 'inbox'");
	}
	async retryAlarm() {
		return this.ctx.storage.getAlarm();
	}
	/** Runs the scheduled index retry now instead of waiting 30 seconds. */
	async runRetryNow() {
		await this.alarm();
		await this.ctx.storage.deleteAlarm();
	}
}
export class InboxIndex extends ProductionInboxIndex {
	#failWrites = false;
	failWrites(enabled: boolean) {
		this.#failWrites = enabled;
	}
	override putSummary(...args: Parameters<ProductionInboxIndex["putSummary"]>) {
		if (this.#failWrites) throw new Error("Simulated index outage");
		return super.putSummary(...args);
	}
	clear() {
		this.ctx.storage.sql.exec("DELETE FROM inbox_summaries");
	}
}
export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);
		if (url.pathname === "/__expire") {
			await (env.AUTH.get(env.AUTH.idFromName("auth")) as unknown as AuthStore).expireShare(
				(await request.json<{ id: string }>()).id,
			);
			return Response.json({ ok: true });
		}
		if (url.pathname === "/__digests")
			return Response.json(
				await (env.AUTH.get(env.AUTH.idFromName("auth")) as unknown as AuthStore).digests(),
			);
		if (url.pathname === "/__sent") return Response.json(sent);
		if (url.pathname === "/__index/clear") {
			await (env.INBOX_INDEX.get(env.INBOX_INDEX.idFromName("index")) as unknown as InboxIndex).clear();
			return Response.json({ ok: true });
		}
		if (url.pathname === "/__index/fail") {
			await (env.INBOX_INDEX.get(env.INBOX_INDEX.idFromName("index")) as unknown as InboxIndex).failWrites(url.searchParams.get("on") === "1");
			return Response.json({ ok: true });
		}
		if (url.pathname === "/__retry") {
			const stub = env.MAILBOX.get(env.MAILBOX.idFromName(url.searchParams.get("mailbox") || "")) as unknown as MailboxDO;
			if (request.method === "POST") await stub.runRetryNow();
			return Response.json({ scheduled: (await stub.retryAlarm()) !== null });
		}
		if (url.pathname === "/__silent-read") {
			const id = env.MAILBOX.idFromName(url.searchParams.get("mailbox") || "");
			await (env.MAILBOX.get(id) as unknown as MailboxDO).markInboxReadSilently();
			return Response.json({ ok: true });
		}
		return handler.fetch(
			request,
			{
				...env,
				EMAIL: {
					async send(payload: Record<string, unknown>) {
						sent.push(payload);
						return { messageId: "local-send-fixture" };
					},
				},
			} as unknown as Env,
			ctx,
		);
	},
};
