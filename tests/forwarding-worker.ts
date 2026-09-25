// Local-only harness; captures forwarding without sending any email.
import app from "./auth-worker";
import { receiveEmail } from "../workers/index";
import type { Env } from "../workers/types";
export { AuthStore, MailboxDO, EmailAgent } from "./auth-worker";

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		if (new URL(request.url).pathname !== "/__receive") return app.fetch(request, env, ctx);
		const { raw, to, headers, failForward, failStore, allowedAddresses } = await request.json<{
			raw: string; to: string; headers?: Record<string, string>;
			failForward?: boolean; failStore?: boolean; allowedAddresses?: string[];
		}>();
		const forwarded: { to: string; headers: Record<string, string>; storedCount: number }[] = [];
		const bytes = new TextEncoder().encode(raw);
		const message = {
			to, raw: new Response(bytes).body!, rawSize: bytes.byteLength,
			headers: new Headers(headers),
			async forward(destination: string, extraHeaders: Headers) {
				const stub = env.MAILBOX.get(env.MAILBOX.idFromName(to.toLowerCase()));
				forwarded.push({ to: destination, headers: Object.fromEntries(extraHeaders), storedCount: await stub.countEmails({ folder: "inbox" }) });
				if (failForward) throw new Error("Test destination is not verified");
				return { messageId: "local-test" };
			},
		} as ForwardableEmailMessage;
		const testEnv = {
			...env,
			...(allowedAddresses ? { EMAIL_ADDRESSES: allowedAddresses } : {}),
			...(failStore ? { MAILBOX: {
				idFromName: () => "test",
				get: () => ({ findThreadBySubject: async () => null, createEmail: async () => { throw new Error("Test storage failure"); } }),
			} } : {}),
		} as Env;
		try {
			await receiveEmail(message, testEnv, ctx);
			return Response.json({ forwarded });
		} catch (error) {
			return Response.json({ forwarded, error: (error as Error).message }, { status: 500 });
		}
	},
};
