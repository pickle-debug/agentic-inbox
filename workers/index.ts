// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { type Context, Hono } from "hono";
import PostalMime from "postal-mime";
import { z } from "zod";
import { sendEmail } from "./email-sender";
import { storeAttachments, type StoredAttachment } from "./lib/attachments";
import {
	validateSender,
	SenderValidationError,
	generateMessageId,
	buildThreadingHeaders,
	listMailboxes,
} from "./lib/email-helpers";
import { SendEmailRequestSchema } from "./lib/schemas";
import { handleReplyEmail, handleForwardEmail } from "./routes/reply-forward";
import { contactRoutes } from "./routes/contacts";
import { mailboxPasswordRoutes } from "./routes/mailbox-password";
import { systemSettingsSchema } from "../shared/system-settings";
import { getSystemSettings, SYSTEM_SETTINGS_KEY } from "./lib/system-settings";
import { authStore } from "./auth";
import { bodyLimit } from "hono/body-limit";
import { Folders } from "../shared/folders";
import { forwardingSettingsSchema } from "../shared/forwarding";
import { autoReplySettingsSchema } from "../shared/automatic-replies";
import { emailPrivacySettingsSchema } from "../shared/email-privacy";
import { canAccessMailbox, shareInputSchema, mailboxAddressSchema } from "../shared/access";
import { mailboxSummaries, rememberMailboxName } from "./inbox-index";
import { acceptsDomain, receptionSchema } from "../shared/reception";
import { defaultMailboxSettings, getReception, RECEPTION_KEY } from "./lib/reception";
import { processAutomaticReplies } from "./lib/automatic-replies";
import type { EmailFull } from "./lib/schemas";
import type { Env } from "./types";
import { requireMailbox, type MailboxContext } from "./lib/mailbox";

type AppContext = Context<MailboxContext>;

// -- Request body schemas (kept for validation) ---------------------

const CreateMailboxBody = z.object({
	email: z.string().email(),
	name: z.string().min(1),
	settings: z.record(z.unknown()).optional(),
});

function mailboxSettingsSchema(mailboxId: string) {
	return z.object({
		privacy: emailPrivacySettingsSchema.optional(),
		forwarding: forwardingSettingsSchema(mailboxId).optional(),
		autoReply: autoReplySettingsSchema.optional(),
	}).passthrough().superRefine((settings, ctx) => {
		for (const key of ["autoDraftRepliesEnabled", "agentSystemPrompt"]) {
			if (Object.hasOwn(settings, key)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: "AI 配置只能在系统设置中修改。" });
		}
	});
}

function publicMailboxSettings(settings: Record<string, unknown>) {
	const { autoDraftRepliesEnabled, agentSystemPrompt, ...mailboxSettings } = settings;
	return mailboxSettings;
}

const DraftBody = z.object({
	to: z.string().optional(),
	cc: z.string().optional(),
	bcc: z.string().optional(),
	subject: z.string().optional(),
	body: z.string(),
	in_reply_to: z.string().optional(),
	thread_id: z.string().optional(),
	draft_id: z.string().optional(),
	attachments: z
		.array(
			z.object({
				content: z.string(),
				filename: z.string(),
				type: z.string(),
				disposition: z.literal("attachment"),
			}),
		)
		.optional(),
});

// -- Helpers --------------------------------------------------------

function slugify(text: string) { // can return "" for non-alphanumeric input
	return text.toString().toLowerCase()
		.replace(/\s+/g, "-").replace(/[^\w-]+/g, "")
		.replace(/--+/g, "-").replace(/^-+/, "").replace(/-+$/, "");
}

function intQuery(c: AppContext, key: string): number | undefined {
	const v = c.req.query(key);
	if (!v) return undefined;
	const n = Number(v);
	return Number.isNaN(n) ? undefined : n;
}

function boolQuery(c: AppContext, key: string): boolean | undefined {
	const v = c.req.query(key);
	if (v === undefined || v === "") return undefined;
	return v === "true" || v === "1";
}

// -- App & middleware -----------------------------------------------

const app = new Hono<MailboxContext>();
// Every API request needs an identity, even if this router is mounted elsewhere.
app.use("/api/*", async (c, next) => {
	if (!c.var.identity) return c.json({ error: "请先登录。" }, 401);
	return next();
});
app.use("/api/v1/mailboxes/:mailboxId/*", async (c, next) => {
	const identity = c.var.identity;
	// 对所有邮箱 API 统一先校验范围，再区分读写/删除；前端隐藏按钮不构成授权。
	if (!canAccessMailbox(identity, c.req.param("mailboxId"))) return c.json({ error: "无权访问该邮箱。" }, 403);
	if (identity.role === "share") {
		const read = ["GET", "HEAD", "OPTIONS"].includes(c.req.method);
		const mailboxRoot = c.req.path.split("/").length === 5;
		if (c.req.path.endsWith("/login") || c.req.path.endsWith("/password")) return c.json({error: "分享访问不能修改登录凭证。"}, 403);
		if (!read && (identity.permission === "read" || ((c.req.method === "DELETE" || mailboxRoot) && identity.permission !== "manage"))) return c.json({error: "分享权限不足。"}, 403);
	} else if (identity.role !== "admin" && (c.req.path.endsWith("/login") || (c.req.method === "DELETE" && c.req.path.split("/").length === 5))) return c.json({ error: "仅管理员可执行此操作。" }, 403);
	return next();
});
app.use("/api/v1/mailboxes/:mailboxId/login", async (c, next) => {
	if (c.var.identity.role !== "admin") return c.json({ error: "仅管理员可管理密码。" }, 403);
	return next();
});
app.use("/api/v1/mailboxes/:mailboxId/login", bodyLimit({ maxSize: 2048 }));
app.use("/api/v1/mailboxes/:mailboxId/*", requireMailbox);
app.route("/api/v1/contacts", contactRoutes);
app.route("/api/v1/mailboxes/:mailboxId/password", mailboxPasswordRoutes);

app.use("/api/v1/settings", async (c, next) => {
	if (c.var.identity.role !== "admin") return c.json({ error: "仅管理员可访问系统设置。" }, 403);
	return next();
});
app.get("/api/v1/settings", async (c) => c.json(await getSystemSettings(c.env)));
app.put("/api/v1/settings", async (c) => {
	const body = systemSettingsSchema.safeParse(await c.req.json().catch(() => null));
	if (!body.success) return c.json({ error: body.error.issues[0].message }, 400);
	await c.env.BUCKET.put(SYSTEM_SETTINGS_KEY, JSON.stringify(body.data));
	return c.json(body.data);
});

app.use("/api/v1/reception", async (c, next) => c.var.identity.role === "admin" ? next() : c.json({error: "仅管理员可配置收信策略。"}, 403));
app.use("/api/v1/reception", bodyLimit({maxSize: 64 * 1024}));
app.get("/api/v1/reception", async c => c.json(await getReception(c.env)));
app.put("/api/v1/reception", async c => {
	const parsed = receptionSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return c.json({error: parsed.error.issues[0].message}, 400);
	await c.env.BUCKET.put(RECEPTION_KEY, JSON.stringify(parsed.data));
	return c.json(parsed.data);
});
app.use("/api/v1/shares/*", async (c, next) => c.var.identity.role === "admin" ? next() : c.json({error: "仅管理员可管理分享凭证。"}, 403));
app.use("/api/v1/shares/*", bodyLimit({maxSize: 4096}));
app.get("/api/v1/shares", async c => c.json(await authStore(c.env).listShares()));
app.post("/api/v1/shares", async c => {
	const parsed = shareInputSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return c.json({error: parsed.error.issues[0].message}, 400);
	if (parsed.data.scope === "mailbox" && !(await c.env.BUCKET.head(`mailboxes/${parsed.data.target}.json`))) return c.json({error: "邮箱不存在。"}, 404);
	if (parsed.data.scope === "domain") {
		const reception = await getReception(c.env);
		const exists = (await listMailboxes(c.env.BUCKET)).some(m => m.email.split("@")[1] === parsed.data.target);
		if (!reception.domains.includes(parsed.data.target) && !exists) return c.json({error: "请先配置该域名或等待首封邮件到达。"}, 400);
	}
	return c.json(await authStore(c.env).createShare(parsed.data), 201);
});
app.delete("/api/v1/shares/:id", async c => { await authStore(c.env).revokeShare(c.req.param("id")); return c.body(null, 204); });

// -- Config ---------------------------------------------------------

app.get("/api/v1/config", async (c) => {
	const reception = await getReception(c.env);
	const identity = c.var.identity;
	if (identity.role === "mailbox") return c.json({domains: [], emailAddresses: []});
	const visible = (await listMailboxes(c.env.BUCKET)).filter(m => canAccessMailbox(identity, m.email));
	const domains = [...new Set([...(identity.role === "admin" ? reception.domains : []), ...visible.map(m => m.email.split("@")[1]), ...(identity.role === "share" && identity.scope === "domain" ? [identity.target] : [])])].sort();
	const emailAddresses = c.env.EMAIL_ADDRESSES ?? [];
	return c.json({ domains, emailAddresses: identity.role === "admin" ? emailAddresses : [], acceptAll: identity.role === "admin" && reception.mode === "all" });
});

// -- Mailboxes ------------------------------------------------------

app.get("/api/v1/mailboxes", async (c) => {
	const allMailboxes = await listMailboxes(c.env.BUCKET);
	const visible = allMailboxes.filter(m => canAccessMailbox(c.var.identity, m.id)).map((m) => ({...m, name: m.id}));
	if (c.req.query("summary") !== "true") return c.json(visible);
	// 先按授权范围过滤，不能为域名/邮箱分享读取其他邮箱的未读数或邮件摘要。
	return c.json(await mailboxSummaries(c.env, visible));
});

app.post("/api/v1/mailboxes", async (c) => {
	if (c.var.identity.role !== "admin") return c.json({ error: "仅管理员可以创建邮箱。" }, 403);
	const body = CreateMailboxBody.safeParse(await c.req.json().catch(() => null));
	if (!body.success) return c.json({ error: body.error.issues[0].message }, 400);
	const { name, settings, email: rawEmail } = body.data;
	const email = rawEmail.toLowerCase();
	const parsedSettings = mailboxSettingsSchema(email).safeParse(settings ?? {});
	if (!parsedSettings.success) return c.json({ error: parsedSettings.error.issues[0].message }, 400);
	if (!acceptsDomain(await getReception(c.env), email.split("@")[1])) return c.json({ error: "邮箱必须属于已配置的域名。" }, 400);
	const allowedAddresses = (c.env.EMAIL_ADDRESSES ?? []) as string[];
	if (allowedAddresses.length > 0 && !allowedAddresses.map((a) => a.toLowerCase()).includes(email)) {
		return c.json({ error: "Mailbox creation is restricted to configured EMAIL_ADDRESSES" }, 403);
	}
	const key = `mailboxes/${email}.json`;
	if (await c.env.BUCKET.head(key)) return c.json({ error: "Mailbox already exists" }, 409);
	const defaultSettings = defaultMailboxSettings(name);
	const finalSettings = { ...defaultSettings, ...parsedSettings.data };
	await c.env.BUCKET.put(key, JSON.stringify(finalSettings));
	await rememberMailboxName(c.env, email, finalSettings.fromName);
	await c.env.BUCKET.delete(`deleted-mailboxes/${email}.json`);
	const stub = c.env.MAILBOX.get(c.env.MAILBOX.idFromName(email));
	await stub.getFolders();
	return c.json({ id: email, email, name, settings: finalSettings }, 201);
});

app.get("/api/v1/mailboxes/:mailboxId", async (c) => {
	const mailboxId = c.req.param("mailboxId")!;
	const obj = await c.env.BUCKET.get(`mailboxes/${mailboxId}.json`);
	if (!obj) return c.json({ error: "Not found" }, 404);
	return c.json({ id: mailboxId, name: mailboxId, email: mailboxId, settings: publicMailboxSettings(await obj.json<Record<string, unknown>>()) });
});

app.put("/api/v1/mailboxes/:mailboxId", async (c) => {
	const mailboxId = c.req.param("mailboxId")!;
	const body = z.object({ settings: mailboxSettingsSchema(mailboxId) }).safeParse(await c.req.json().catch(() => null));
	if (!body.success) return c.json({ error: body.error.issues[0].message }, 400);
	const key = `mailboxes/${mailboxId}.json`;
	const existing = await c.env.BUCKET.get(key);
	if (!existing) return c.json({ error: "Not found" }, 404);
	// Partial updates must not erase unrelated settings saved by older clients.
	const settings = { ...await existing.json<Record<string, unknown>>(), ...body.data.settings };
	await c.env.BUCKET.put(key, JSON.stringify(settings));
	await rememberMailboxName(c.env, mailboxId, settings.fromName);
	return c.json({ id: mailboxId, name: mailboxId, email: mailboxId, settings: publicMailboxSettings(settings) });
});

app.delete("/api/v1/mailboxes/:mailboxId", async (c) => {
	if (c.var.identity.role !== "admin") return c.json({ error: "仅管理员可以删除邮箱。" }, 403);
	const mailboxId = c.req.param("mailboxId")!;
	const key = `mailboxes/${mailboxId}.json`;
	if (!(await c.env.BUCKET.head(key))) return c.json({ error: "Not found" }, 404);
	await c.env.BUCKET.put(`deleted-mailboxes/${mailboxId}.json`, JSON.stringify({deleted: Date.now()}));
	await authStore(c.env).disable(mailboxId);
	await authStore(c.env).revokeMailboxShares(mailboxId);
	await c.env.EMAIL_AGENT.get(c.env.EMAIL_AGENT.idFromName(mailboxId)).disconnectClients();
	await c.env.BUCKET.delete(key); // TODO: also delete DO data and R2 attachment blobs
	return c.body(null, 204);
});

// Credentials live separately from public mailbox settings and are never returned.
app.get("/api/v1/mailboxes/:mailboxId/login", async (c) => c.json(await authStore(c.env).status(c.req.param("mailboxId"))));
app.put("/api/v1/mailboxes/:mailboxId/login", async (c) => {
	const body = z.object({ password: z.string().min(12).max(128) }).safeParse(await c.req.json().catch(() => null));
	if (!body.success) return c.json({ error: "密码长度必须为 12–128 个字符。" }, 400);
	const mailboxId = c.req.param("mailboxId");
	const result = await authStore(c.env).setPassword(mailboxId, body.data.password);
	await c.env.EMAIL_AGENT.get(c.env.EMAIL_AGENT.idFromName(mailboxId)).disconnectClients();
	return c.json(result);
});
app.delete("/api/v1/mailboxes/:mailboxId/login", async (c) => {
	const mailboxId = c.req.param("mailboxId");
	const result = await authStore(c.env).disable(mailboxId);
	await c.env.EMAIL_AGENT.get(c.env.EMAIL_AGENT.idFromName(mailboxId)).disconnectClients();
	return c.json(result);
});

// -- Emails ---------------------------------------------------------

app.get("/api/v1/mailboxes/:mailboxId/emails", async (c: AppContext) => {
	const folder = c.req.query("folder");
	const thread_id = c.req.query("thread_id");
	const threaded = boolQuery(c, "threaded");
	const page = intQuery(c, "page");
	const limit = intQuery(c, "limit");
	const sortColumn = c.req.query("sortColumn") as any;
	const sortDirection = c.req.query("sortDirection") as "ASC" | "DESC" | undefined;
	const stub = c.var.mailboxStub;

	if (threaded && folder) {
		const emails = await (stub as any).getThreadedEmails({ folder, page, limit });
		const totalCount = await (stub as any).countThreadedEmails(folder);
		return c.json({ emails, totalCount });
	}
	const emails = await stub.getEmails({ folder, thread_id, page, limit, sortColumn, sortDirection });
	if (folder) {
		const totalCount = await stub.countEmails({ folder, thread_id });
		return c.json({ emails, totalCount });
	}
	return c.json(emails);
});

app.post("/api/v1/mailboxes/:mailboxId/emails", async (c: AppContext) => {
	const mailboxId = c.req.param("mailboxId")!;
	const body = SendEmailRequestSchema.parse(await c.req.json());
	const { to, cc, bcc, from, subject, html, text, attachments, in_reply_to, references, thread_id } = body;

	let toStr: string, fromEmail: string, fromDomain: string;
	try {
		({ toStr, fromEmail, fromDomain } = validateSender(to, from, mailboxId));
	} catch (e) {
		if (e instanceof SenderValidationError) return c.json({ error: e.message }, 400);
		throw e;
	}

	const { messageId, outgoingMessageId } = generateMessageId(fromDomain);
	const stub = c.var.mailboxStub;
	const rateLimitError = await (stub as any).checkSendRateLimit();
	if (rateLimitError) return c.json({ error: rateLimitError }, 429);
	const attachmentData = await storeAttachments(c.env.BUCKET, messageId, attachments);

	await stub.createEmail(Folders.SENT, {
		id: messageId, subject, sender: fromEmail, recipient: toStr,
		cc: cc ? (Array.isArray(cc) ? cc.join(", ") : cc).toLowerCase() : null,
		bcc: bcc ? (Array.isArray(bcc) ? bcc.join(", ") : bcc).toLowerCase() : null,
		date: new Date().toISOString(), body: html || text || "",
		in_reply_to: in_reply_to || null, email_references: references ? JSON.stringify(references) : null,
		thread_id: thread_id || in_reply_to || messageId, message_id: outgoingMessageId,
		raw_headers: JSON.stringify([
			{ key: "from", value: typeof from === "string" ? from : `${from.name} <${from.email}>` },
			{ key: "to", value: Array.isArray(to) ? to.join(", ") : to },
			...(cc ? [{ key: "cc", value: Array.isArray(cc) ? cc.join(", ") : cc }] : []),
			...(bcc ? [{ key: "bcc", value: Array.isArray(bcc) ? bcc.join(", ") : bcc }] : []),
			{ key: "subject", value: subject }, { key: "date", value: new Date().toISOString() },
			{ key: "message-id", value: `<${outgoingMessageId}>` },
		]),
	}, attachmentData);

	c.executionCtx.waitUntil(
		sendEmail(c.env.EMAIL, {
			to, cc, bcc, from, subject, html, text,
			attachments: attachments?.map((att) => ({ content: att.content, filename: att.filename, type: att.type, disposition: att.disposition || "attachment", contentId: att.contentId })),
			...(in_reply_to ? { headers: buildThreadingHeaders(in_reply_to, references || []) } : {}),
		}).catch((e) => console.error("Deferred email delivery failed:", (e as Error).message)),
	);
	return c.json({ id: messageId, status: "sent" }, 202);
});

app.post("/api/v1/mailboxes/:mailboxId/drafts", async (c: AppContext) => {
	const mailboxId = c.req.param("mailboxId")!;
	const { to, cc, bcc, subject, body, in_reply_to, thread_id, draft_id, attachments } = DraftBody.parse(await c.req.json());
	const stub = c.var.mailboxStub;
	if (draft_id && c.var.identity.role === "share" && c.var.identity.permission !== "manage") {
		const previous = await stub.getEmail(draft_id);
		if (!previous || previous.folder_id !== Folders.DRAFT) return c.json({error: "只能替换已有草稿。"}, 403);
	}
	const messageId = crypto.randomUUID();
	const now = new Date().toISOString();
	const attachmentData = await storeAttachments(c.env.BUCKET, messageId, attachments);
	await stub.createEmail(Folders.DRAFT, {
		id: messageId, subject: subject || "", sender: mailboxId.toLowerCase(),
		recipient: (to || "").toLowerCase(), cc: cc?.toLowerCase() || null, bcc: bcc?.toLowerCase() || null,
		date: now, body, in_reply_to: in_reply_to || null, email_references: null,
		thread_id: thread_id || in_reply_to || messageId,
	}, attachmentData);
	if (draft_id) {
		const oldAttachments = await stub.deleteEmail(draft_id);
		if (oldAttachments?.length) {
			await c.env.BUCKET.delete(
				oldAttachments.map((attachment: any) =>
					`attachments/${draft_id}/${attachment.id}/${attachment.filename}`,
				),
			);
		}
	}
	return c.json({ id: messageId, status: "draft", subject: subject || "", recipient: to || "", date: now }, 201);
});

app.get("/api/v1/mailboxes/:mailboxId/emails/:id", async (c: AppContext) => {
	const email = await c.var.mailboxStub.getEmail(c.req.param("id")!);
	if (!email) return c.json({ error: "Email not found" }, 404);
	return new Response(JSON.stringify(email), {
		headers: { "Content-Type": "application/json" },
	});
});

app.put("/api/v1/mailboxes/:mailboxId/emails/:id", async (c: AppContext) => {
	const { read, starred } = (await c.req.json()) as { read?: boolean; starred?: boolean };
	const email = await c.var.mailboxStub.updateEmail(c.req.param("id")!, { read, starred });
	return email ? c.json(email) : c.json({ error: "Email not found" }, 404);
});

app.delete("/api/v1/mailboxes/:mailboxId/emails/:id", async (c: AppContext) => {
	const id = c.req.param("id")!;
	const attachments = await c.var.mailboxStub.deleteEmail(id);
	if (attachments === null) return c.json({ error: "Not found" }, 404);
	if (attachments.length > 0) await c.env.BUCKET.delete(attachments.map((att: any) => `attachments/${id}/${att.id}/${att.filename}`));
	return c.body(null, 204);
});

app.post("/api/v1/mailboxes/:mailboxId/emails/:id/move", async (c: AppContext) => {
	const { folderId } = (await c.req.json()) as { folderId: string };
	if (folderId === Folders.TRASH && c.var.identity.role === "share" && c.var.identity.permission !== "manage") return c.json({error: "删除邮件需要管理权限。"}, 403);
	const success = await c.var.mailboxStub.moveEmail(c.req.param("id")!, folderId);
	return success ? c.json({ status: "moved" }) : c.json({ error: "Folder not found" }, 400);
});

// -- Threads --------------------------------------------------------

app.get("/api/v1/mailboxes/:mailboxId/threads/:threadId", async (c: AppContext) => {
	return c.json(await (c.var.mailboxStub as any).getThreadEmails(c.req.param("threadId")!));
});

app.post("/api/v1/mailboxes/:mailboxId/threads/:threadId/read", async (c: AppContext) => {
	await c.var.mailboxStub.markThreadRead(c.req.param("threadId")!);
	return c.json({ status: "marked_read" });
});

// -- Reply / Forward ------------------------------------------------

app.post("/api/v1/mailboxes/:mailboxId/emails/:id/reply", handleReplyEmail);
app.post("/api/v1/mailboxes/:mailboxId/emails/:id/forward", handleForwardEmail);

// -- Folders --------------------------------------------------------

app.get("/api/v1/mailboxes/:mailboxId/folders", async (c: AppContext) => c.json(await c.var.mailboxStub.getFolders()));

app.post("/api/v1/mailboxes/:mailboxId/folders", async (c: AppContext) => {
	const { name } = (await c.req.json()) as { name: string };
	const slug = slugify(name);
	if (!slug) return c.json({ error: "Folder name must contain alphanumeric characters" }, 400);
	const f = await c.var.mailboxStub.createFolder(slug, name);
	return f ? c.json(f, 201) : c.json({ error: "Folder with this name already exists" }, 409);
});

app.put("/api/v1/mailboxes/:mailboxId/folders/:id", async (c: AppContext) => {
	const { name } = (await c.req.json()) as { name: string };
	const f = await c.var.mailboxStub.updateFolder(c.req.param("id")!, name);
	return f ? c.json(f) : c.json({ error: "Folder not found" }, 404);
});

app.delete("/api/v1/mailboxes/:mailboxId/folders/:id", async (c: AppContext) => {
	const ok = await c.var.mailboxStub.deleteFolder(c.req.param("id")!);
	return ok ? c.body(null, 204) : c.json({ error: "Folder not found or cannot be deleted" }, 400);
});

// -- Search ---------------------------------------------------------

app.get("/api/v1/mailboxes/:mailboxId/search", async (c: AppContext) => {
	const searchOpts: Record<string, unknown> = {
		query: c.req.query("query") || "", folder: c.req.query("folder"), from: c.req.query("from"),
		to: c.req.query("to"), subject: c.req.query("subject"), date_start: c.req.query("date_start"),
		date_end: c.req.query("date_end"), is_read: boolQuery(c, "is_read"),
		is_starred: boolQuery(c, "is_starred"), has_attachment: boolQuery(c, "has_attachment"),
	};
	const stub = c.var.mailboxStub as any;
	const emails = await stub.searchEmails({ ...searchOpts, page: intQuery(c, "page"), limit: intQuery(c, "limit") });
	const totalCount = await stub.countSearchResults(searchOpts);
	return c.json({ emails, totalCount });
});

// -- Attachments ----------------------------------------------------

app.get("/api/v1/mailboxes/:mailboxId/emails/:emailId/attachments/:attachmentId", async (c: AppContext) => {
	const emailId = c.req.param("emailId")!;
	const attachmentId = c.req.param("attachmentId")!;
	const attachment = await c.var.mailboxStub.getAttachment(attachmentId);
	if (!attachment || attachment.email_id !== emailId) return c.json({ error: "Attachment not found" }, 404);
	const obj = await c.env.BUCKET.get(`attachments/${emailId}/${attachmentId}/${attachment.filename}`);
	if (!obj) return c.json({ error: "Attachment file not found" }, 404);
	const headers = new Headers();
	headers.set("Content-Type", attachment.mimetype);
	const sanitized = attachment.filename.replace(/[\x00-\x1f"\\]/g, "_");
	headers.set("Content-Disposition", `attachment; filename="${sanitized}"; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`);
	return new Response(obj.body, { headers });
});

// -- Receive inbound email ------------------------------------------

const MAX_EMAIL_SIZE = 25 * 1024 * 1024;

async function streamToArrayBuffer(stream: ReadableStream, streamSize: number) {
	if (streamSize > MAX_EMAIL_SIZE) throw new Error(`Email too large: ${streamSize} bytes exceeds ${MAX_EMAIL_SIZE} byte limit`);
	if (streamSize <= 0) throw new Error(`Invalid stream size: ${streamSize}`);
	const result = new Uint8Array(streamSize);
	let bytesRead = 0;
	const reader = stream.getReader();
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		if (bytesRead + value.length > streamSize) { reader.cancel(); throw new Error(`Stream exceeds declared size`); }
		result.set(value, bytesRead);
		bytesRead += value.length;
	}
	return result;
}

async function receiveEmail(event: ForwardableEmailMessage, env: Env, ctx: ExecutionContext) {
	const rawEmail = await streamToArrayBuffer(event.raw, event.rawSize);
	const parsedEmail = await new PostalMime().parse(rawEmail);

	const allowedAddresses = ((env.EMAIL_ADDRESSES ?? []) as string[]).map((a) => a.toLowerCase());
	const allRecipients = (parsedEmail.to || []).map((t) => t.address?.toLowerCase()).filter(Boolean) as string[];
	const ccRecipients = (parsedEmail.cc || []).map((e) => e.address?.toLowerCase()).filter(Boolean) as string[];
	const bccRecipients = (parsedEmail.bcc || []).map((e) => e.address?.toLowerCase()).filter(Boolean) as string[];

	// The SMTP envelope identifies the receiving mailbox, including BCC delivery.
	const parsedRecipient = mailboxAddressSchema.safeParse(event.to);
	if (!parsedRecipient.success) throw new Error("received email with no valid recipient address");
	const mailboxId = parsedRecipient.data;
	if (allowedAddresses.length > 0 && !allowedAddresses.includes(mailboxId)) {
		console.log("Ignoring email: envelope recipient does not match EMAIL_ADDRESSES.");
		return;
	}

	const messageId = crypto.randomUUID();
	const reception = await getReception(env);
	if (!acceptsDomain(reception, mailboxId.split("@")[1])) { console.log("Ignoring email: receiving domain is not enabled."); return; }
	if (!(await env.BUCKET.head(`mailboxes/${mailboxId}.json`))) {
		if (!reception.autoCreate) { console.log("Ignoring email: mailbox does not exist"); return; }
		// 删除标记避免普通来信自动复活邮箱及其保留的历史数据；仅管理员显式建箱可清除。
		if (await env.BUCKET.head(`deleted-mailboxes/${mailboxId}.json`)) { console.log("Ignoring email: mailbox was deleted by an administrator."); return; }
		// Atomic create: simultaneous first deliveries must never overwrite settings.
		await env.BUCKET.put(`mailboxes/${mailboxId}.json`, JSON.stringify(defaultMailboxSettings(mailboxId.split("@")[0])), {onlyIf: {etagDoesNotMatch: "*"}});
	}

	const stub = env.MAILBOX.get(env.MAILBOX.idFromName(mailboxId));

	const attachmentData: StoredAttachment[] = [];
	if (parsedEmail.attachments) {
		for (const att of parsedEmail.attachments) {
			const attId = crypto.randomUUID();
			const filename = (att.filename || "untitled").replace(/[\/\\:*?"<>|\x00-\x1f]/g, "_");
			await env.BUCKET.put(`attachments/${messageId}/${attId}/${filename}`, att.content);
			attachmentData.push({ id: attId, email_id: messageId, filename, mimetype: att.mimeType,
				size: typeof att.content === "string" ? att.content.length : att.content.byteLength,
				content_id: att.contentId || null, disposition: att.disposition || "attachment" });
		}
	}

	const extractMsgId = (s: string) => { const m = s.match(/<([^>]+)>/); return m ? m[1] : s.trim().split(/\s+/)[0]; };
	const inReplyTo = parsedEmail.inReplyTo ? extractMsgId(parsedEmail.inReplyTo) : null;
	const emailReferences = parsedEmail.references ? parsedEmail.references.split(/\s+/).filter(Boolean).map(extractMsgId) : [];
	let threadId = emailReferences[0] || inReplyTo || messageId;

	if (!inReplyTo && emailReferences.length === 0) {
		const subjectThread = await (stub as any).findThreadBySubject(parsedEmail.subject || "", parsedEmail.from?.address || undefined);
		if (subjectThread) threadId = subjectThread;
	}

	const originalMessageId = parsedEmail.messageId ? extractMsgId(parsedEmail.messageId) : null;

	const incoming = {
		id: messageId, subject: parsedEmail.subject || "",
		sender: (parsedEmail.from?.address || "").toLowerCase(), recipient: allRecipients.join(", "),
		cc: ccRecipients.join(", ") || null, bcc: bccRecipients.join(", ") || null,
		date: new Date().toISOString(), // uses receive time, not the email's Date header
		body: parsedEmail.html || parsedEmail.text || "",
		in_reply_to: inReplyTo, email_references: emailReferences.length > 0 ? JSON.stringify(emailReferences) : null,
		thread_id: threadId, message_id: originalMessageId, raw_headers: JSON.stringify(parsedEmail.headers),
		read: false, starred: false,
	} satisfies EmailFull;
	await stub.createEmail(Folders.INBOX, incoming, attachmentData);

	// Fixed replies remain mailbox-specific; AI drafts require an explicit global opt-in.
	try {
		const settingsObject = await env.BUCKET.get(`mailboxes/${mailboxId}.json`);
		const settings = settingsObject
			? await settingsObject.json<{ autoReply?: unknown; fromName?: unknown; forwarding?: unknown }>()
			: null;
		if (settings) ctx.waitUntil(processAutomaticReplies(env, mailboxId, settings, event, incoming, rawEmail));
		// Forward only after storing the Inbox copy; missing or invalid legacy settings stay disabled.
		const forwarding = forwardingSettingsSchema(mailboxId).safeParse(settings?.forwarding);
		// A returned copy is still stored, but must not start another automatic forwarding hop.
		if (forwarding.success && forwarding.data.enabled && !event.headers.has("X-Agentic-Inbox-Forwarded")) {
			try {
				await event.forward(forwarding.data.email, new Headers({ "X-Agentic-Inbox-Forwarded": "true" }));
			} catch (error) {
				// The original is already stored; retrying the whole delivery would create duplicate Inbox copies.
				console.error("Automatic email forwarding failed:", error instanceof Error ? error.message : "Unknown error");
			}
		}
	} catch (error) {
		// Fail closed: unreadable settings must not trigger automatic actions.
		console.error("Failed to read incoming email settings:", error instanceof Error ? error.message : "Unknown error");
	}
}

export { app, receiveEmail };
