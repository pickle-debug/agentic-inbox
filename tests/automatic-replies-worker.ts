// Local-only harness. EMAIL.send is captured and all AI generation is replaced.
import app from "./auth-worker";
import { receiveEmail } from "../workers/index";
import { EmailAgent as ProductionAgent } from "../workers/agent";
import { MailboxDO as ProductionMailbox } from "../workers/durableObject";
import type { Env } from "../workers/types";
export { AuthStore, ContactsStore } from "./auth-worker";

export class MailboxDO extends ProductionMailbox {
	ageAutomaticReplies() {
		this.ctx.storage.sql.exec("UPDATE automatic_reply_attempts SET attempted_at = ?", Date.now() - 86_400_001);
	}
	async seedManualSends(count: number, age: number) {
		for (let i = 0; i < count; i++) await this.createEmail("sent", {
			id: crypto.randomUUID(), sender: "quota@example.com", recipient: "recipient@example.net",
			subject: "Quota fixture", body: "Local fixture", date: new Date(Date.now() - age).toISOString(),
		}, []);
	}
}

export class EmailAgent extends ProductionAgent {
	async handleNewEmail(data: Parameters<ProductionAgent["handleNewEmail"]>[0]) {
		if (data.subject === "Fail draft") throw new Error("Test draft failure");
		const env = this.env as Env;
		await env.MAILBOX.get(env.MAILBOX.idFromName(data.mailboxId)).createEmail("draft", {
			id: crypto.randomUUID(), sender: data.mailboxId, recipient: data.sender,
			subject: `Re: ${data.subject}`, body: "Local test draft", date: new Date().toISOString(),
			thread_id: data.threadId, in_reply_to: data.emailId, email_references: null,
		}, []);
		return { status: "draft_generated", text: "Local test draft" };
	}
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		if (new URL(request.url).pathname === "/__quota") {
			const { mailbox, count = 0, age = 0, expire = false } = await request.json<{ mailbox: string; count?: number; age?: number; expire?: boolean }>();
			const stub = env.MAILBOX.get(env.MAILBOX.idFromName(mailbox)) as unknown as MailboxDO;
			if (expire) await stub.ageAutomaticReplies();
			await stub.seedManualSends(count, age);
			return Response.json({ error: await stub.checkSendRateLimit() });
		}
		if (new URL(request.url).pathname !== "/__receive") return app.fetch(request, env, ctx);
		const { raw, to, from, failSend, failStore } = await request.json<{
			raw: string; to: string; from: string; failSend?: boolean; failStore?: boolean;
		}>();
		const sent: Record<string, unknown>[] = [];
		const pending: Promise<unknown>[] = [];
		const bytes = new TextEncoder().encode(raw);
		const headers = new Headers();
		for (const line of raw.split(/\r?\n\r?\n/)[0].split(/\r?\n/)) {
			const colon = line.indexOf(":");
			if (colon > 0) headers.append(line.slice(0, colon), line.slice(colon + 1).trim());
		}
		const message = { to, from, raw: new Response(bytes).body!, rawSize: bytes.byteLength, headers,
			async forward() { throw new Error("Unexpected forwarding in automatic reply test"); },
		} as ForwardableEmailMessage;
		const testEnv = {
			...env,
			EMAIL: { async send(payload: Record<string, unknown>) {
				const storedCount = await env.MAILBOX.get(env.MAILBOX.idFromName(to.toLowerCase())).countEmails({ folder: "inbox" });
				sent.push({ ...payload, storedCount });
				if (failSend) throw new Error("Test email send failure");
				return { messageId: "local-test-message" };
			} },
			...(failStore ? { MAILBOX: {
				idFromName: () => "test",
				get: () => ({ findThreadBySubject: async () => null, createEmail: async () => { throw new Error("Test storage failure"); } }),
			} } : {}),
		} as unknown as Env;
		try {
			await receiveEmail(message, testEnv, { waitUntil(promise: Promise<unknown>) { pending.push(promise); } } as ExecutionContext);
			await Promise.allSettled(pending);
			return Response.json({ sent });
		} catch (error) {
			await Promise.allSettled(pending);
			return Response.json({ sent, error: (error as Error).message }, { status: 500 });
		}
	},
};
