import { systemSettingsSchema, type SystemSettings } from "../../shared/system-settings";
import type { Env } from "../types";

export const SYSTEM_SETTINGS_KEY = "settings/system.json";

/** Read on each use so all mailbox agents observe administrative changes. */
export async function getSystemSettings(env: Pick<Env, "BUCKET">): Promise<SystemSettings> {
	const object = await env.BUCKET.get(SYSTEM_SETTINGS_KEY);
	if (!object) return { autoDraftRepliesEnabled: false, agentSystemPrompt: "" };
	return systemSettingsSchema.parse(await object.json());
}
