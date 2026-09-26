import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { authStore } from "../auth";
import type { MailboxContext } from "../lib/mailbox";

export const mailboxPasswordRoutes = new Hono<MailboxContext>();
mailboxPasswordRoutes.use("*", bodyLimit({ maxSize: 2048 }));
mailboxPasswordRoutes.post("/", async (c) => {
	const email = c.req.param("mailboxId");
	if (c.var.identity?.role !== "mailbox" || c.var.identity.email !== email) {
		return c.json({ error: "只能修改自己邮箱的密码。" }, 403);
	}
	const parsed = z.object({
		currentPassword: z.string().min(1).max(128),
		password: z.string().min(12).max(128),
	}).safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return c.json({ error: "请输入当前密码，新密码长度必须为 12–128 个字符。" }, 400);
	const result = await authStore(c.env).changePassword(email, parsed.data.currentPassword, parsed.data.password, c.req.header("cf-connecting-ip") ?? "local");
	if ("error" in result) return c.json({ error: result.error === "limited" ? "尝试次数过多，请 15 分钟后重试。" : "当前密码不正确。" }, result.error === "limited" ? 429 : 401);
	try {
		await c.env.EMAIL_AGENT.get(c.env.EMAIL_AGENT.idFromName(email)).disconnectClients();
	} catch {
		// Password and session revocation are already committed; connections recheck sessions.
		console.warn("Password changed, but immediate connection cleanup failed.");
	}
	return c.json({ ok: true });
});
