import { getAgentByName } from "agents";
import { z } from "zod";
import { autoReplySettingsSchema } from "../../shared/automatic-replies";
import { Folders } from "../../shared/folders";
import { sendEmail } from "../email-sender";
import type { Env } from "../types";
import type { EmailFull } from "./schemas";
import { buildThreadingHeaders, generateMessageId, getMailboxStub, textToHtml } from "./email-helpers";
import { getSystemSettings } from "./system-settings";

type ReplySettings = { autoReply?: unknown; fromName?: unknown };

function automaticReplyRecipient(event: ForwardableEmailMessage, original: EmailFull, mailboxId: string): string | null {
	// RFC 3834: acknowledge the envelope sender, never an arbitrary Reply-To or CC address.
	const sender = event.from?.trim().toLowerCase();
	if (!sender || !z.string().email().max(254).safeParse(sender).success) return null;
	if ([sender, original.sender.toLowerCase()].some(address => address === mailboxId || /^(?:mailer-daemon|postmaster|no[._-]?reply)(?:[+@])/i.test(address))) return null;
	const storedHeaders = JSON.parse(original.raw_headers || "[]") as { key: string; value: string }[];
	// Inspect each value separately; merging duplicate Return-Path headers hides the empty path.
	const values = (name: string) => [
		...storedHeaders.filter(header => header.key.toLowerCase() === name.toLowerCase()).map(header => header.value),
		...(event.headers.has(name) ? [event.headers.get(name)!] : []),
	];
	if (values("Auto-Submitted").some(value => value.trim().toLowerCase() !== "no")) return null;
	if (["X-Agentic-Inbox-Auto-Reply", "X-Agentic-Inbox-Forwarded", "List-Id", "List-Unsubscribe"].some(name => values(name).length)) return null;
	if (values("Precedence").some(value => /\b(?:bulk|list|junk)\b/i.test(value))) return null;
	if (values("X-Auto-Response-Suppress").some(value => /\b(?:all|autoreply|oof)\b/i.test(value))) return null;
	if (values("Return-Path").some(value => value.trim() === "<>") || values("Content-Type").some(value => /multipart\/report/i.test(value))) return null;
	return sender;
}

async function digest(value: string | Uint8Array): Promise<string> {
	const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
	const hash = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
	return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function sendAutomaticReply(env: Env, mailboxId: string, settings: ReplySettings, event: ForwardableEmailMessage, original: EmailFull, raw: Uint8Array) {
	const parsed = autoReplySettingsSchema.safeParse(settings.autoReply);
	if (!parsed.success || !parsed.data.enabled) return;
	const recipient = automaticReplyRecipient(event, original, mailboxId);
	if (!recipient) return;
	const { messageId, outgoingMessageId } = generateMessageId(mailboxId.split("@")[1]);
	const stub = getMailboxStub(env, mailboxId);
	const messageKey = await digest(`${recipient}\0${original.message_id || await digest(raw)}`);
	const skip = await stub.claimAutomaticReply(messageKey, recipient, messageId);
	if (skip) {
		console.info("Automatic reply skipped:", skip);
		return;
	}

	const validMessageId = (value: string) => value.length <= 998 && /^[^\s<>\x00-\x1f\x7f]+$/.test(value);
	const originalMsgId = original.message_id && validMessageId(original.message_id) ? original.message_id : null;
	const previousRefs = JSON.parse(original.email_references || "[]") as string[];
	const references = [...previousRefs.filter(validMessageId).slice(-20), ...(originalMsgId ? [originalMsgId] : [])];
	const subject = parsed.data.subject || (/^re:/i.test(original.subject) ? original.subject : `Re: ${original.subject || "(no subject)"}`).replace(/[\r\n]/g, " ").slice(0, 200);
	const headers = {
		...(originalMsgId ? buildThreadingHeaders(originalMsgId, references) : {}),
		"Message-ID": `<${outgoingMessageId}>`,
		"Auto-Submitted": "auto-replied",
		"X-Auto-Response-Suppress": "All",
		"X-Agentic-Inbox-Auto-Reply": "true",
	};
	const html = textToHtml(parsed.data.message);
	const fromName = typeof settings.fromName === "string" ? settings.fromName.replace(/[\r\n]/g, " ").trim() : "";
	const result = await sendEmail(env.EMAIL, {
		from: fromName ? { email: mailboxId, name: fromName } : mailboxId,
		to: recipient, subject, text: parsed.data.message, html, headers,
	});
	// Keep the claim on failure: a provider timeout may already have delivered the email.
	// Only accepted sends appear in Sent; incoming mail always remains unread in Inbox.
	const sentMessageId = result.messageId?.replace(/^<|>$/g, "") || outgoingMessageId;
	const date = new Date().toISOString();
	await stub.createEmail(Folders.SENT, {
		id: messageId, subject, sender: mailboxId, recipient, date, body: html,
		in_reply_to: originalMsgId, email_references: references.length ? JSON.stringify(references) : null,
		thread_id: original.thread_id || original.id, message_id: sentMessageId,
		raw_headers: JSON.stringify(Object.entries({
			...headers, "Message-ID": `<${sentMessageId}>`, From: mailboxId, To: recipient, Subject: subject, Date: date,
		}).map(([key, value]) => ({ key: key.toLowerCase(), value }))),
	}, []);
}

/** Fixed acknowledgements and AI drafts are independent actions for the same mailbox. */
export async function processAutomaticReplies(env: Env, mailboxId: string, settings: ReplySettings, event: ForwardableEmailMessage, original: EmailFull, raw: Uint8Array) {
	const fixedReply = sendAutomaticReply(env, mailboxId, settings, event, original, raw)
		.catch(error => console.error("Automatic reply failed:", error instanceof Error ? error.message : "Unknown error"));
	const draftReply = (async () => {
		if (!(await getSystemSettings(env)).autoDraftRepliesEnabled) return;
		const agent = await getAgentByName(env.EMAIL_AGENT, mailboxId);
		const response = await agent.fetch(new Request("https://agents/onNewEmail", {
			method: "POST", headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ mailboxId, emailId: original.id, sender: original.sender, subject: original.subject, threadId: original.thread_id || original.id }),
		}));
		if (!response.ok) throw new Error(`Agent returned HTTP ${response.status}`);
	})().catch(error => console.error("Auto-draft trigger failed:", error instanceof Error ? error.message : "Unknown error"));
	await Promise.all([fixedReply, draftReply]);
}
