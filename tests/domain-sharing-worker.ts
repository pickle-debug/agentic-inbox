// Local-only harness; never deployed. Incoming mail and auth storage use production code.
import handler from "./forwarding-worker";
import { AuthStore as BaseAuthStore } from "./auth-worker";
export { MailboxDO, EmailAgent, ContactsStore } from "./auth-worker";
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
