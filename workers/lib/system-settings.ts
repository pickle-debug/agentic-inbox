import { systemSettingsSchema, type SystemSettings } from "../../shared/system-settings";
import { emailPrivacySettingsSchema, type EmailPrivacySettings } from "../../shared/email-privacy";
import { listMailboxes } from "./email-helpers";
import type { Env } from "../types";

export const SYSTEM_SETTINGS_KEY = "settings/system.json";

/** Read on each use so all mailbox agents observe administrative changes. */
export async function getSystemSettings(env: Pick<Env, "BUCKET">): Promise<SystemSettings> {
	const object = await env.BUCKET.get(SYSTEM_SETTINGS_KEY);
	// `privacy` stays undefined until an administrator saves the system-wide sender policy.
	return systemSettingsSchema.parse(object ? await object.json() : { autoDraftRepliesEnabled: false, agentSystemPrompt: "" });
}

/**
 * Sender-privacy rules that mailboxes enabled before the policy became system-wide. Offered as
 * the starting value in System settings, so saving it once carries every old rule over.
 */
export async function legacyMailboxPrivacy(env: Pick<Env, "BUCKET">): Promise<EmailPrivacySettings> {
	const domains = new Set<string>();
	const mailboxes = await listMailboxes(env.BUCKET);
	for (let i = 0; i < mailboxes.length; i += 10) {
		await Promise.all(mailboxes.slice(i, i + 10).map(async ({id}) => {
			try {
				const settings = await (await env.BUCKET.get(`mailboxes/${id}.json`))?.json<{privacy?: unknown}>();
				const policy = emailPrivacySettingsSchema.safeParse(settings?.privacy);
				if (policy.success && policy.data.enabled) for (const domain of policy.data.domains) domains.add(domain);
			} catch {
				// An unreadable mailbox file contributes no rules.
			}
		}));
	}
	const list = [...domains].sort().slice(0, 100);
	return {enabled: list.length > 0, domains: list};
}
