import { routeAgentRequest } from "agents";
import { getCookie } from "hono/cookie";
import type { Context } from "hono";
import type { AuthContext } from "./index";

export async function handleAgentRequest(c: Context<AuthContext>) {
	const identity = c.var.identity;
	if (!identity) return c.json({ error: "请先登录。" }, 401);
	const segments = c.req.path.split("/");
	let mailboxId: string;
	try { mailboxId = decodeURIComponent(segments[3] ?? ""); } catch { return c.json({ error: "Invalid mailbox" }, 400); }
	if (segments[2] !== "email-agent" || !mailboxId || segments.slice(4).some(p => p === "onNewEmail")) return c.json({ error: "Not found" }, 404);
	if (identity.role !== "admin" && mailboxId !== identity.email) return c.json({ error: "无权访问该邮箱。" }, 403);
	if (!(await c.env.BUCKET.head(`mailboxes/${mailboxId}.json`))) return c.json({ error: "Not found" }, 404);
	const headers = new Headers(c.req.raw.headers);
	// Overwrite caller-controlled metadata before forwarding through the private binding.
	headers.set("x-inbox-role", identity.role);
	headers.set("x-inbox-email", identity.email);
	headers.set("x-inbox-expiry", String(identity.expires));
	headers.set("x-inbox-session", (getCookie(c, new URL(c.req.url).protocol === "https:" ? "__Host-inbox_session" : "inbox_session") ?? ""));
	// PartyServer uses the literal URL segment as its DO name. Canonicalize the
	// address so encoded and unencoded @ never create different agent instances.
	const url = new URL(c.req.url);
	if (!/^[a-zA-Z0-9.!#$&'*+=?^_`{|}~-]+@[a-zA-Z0-9.-]+$/.test(mailboxId)) return c.json({ error: "Invalid mailbox" }, 400);
	segments[3] = mailboxId;
	url.pathname = segments.join("/");
	const response = await routeAgentRequest(new Request(url, new Request(c.req.raw, { headers })), c.env);
	if (response) return response;
	return c.text("Agent not found", 404);
}
