import { z } from "zod";
import { emailPrivacySettingsSchema } from "./email-privacy";

export const unreadBadgeStyleSchema = z.enum(["count", "dot"]);
export type UnreadBadgeStyle = z.infer<typeof unreadBadgeStyleSchema>;

export const systemSettingsSchema = z.object({
	autoDraftRepliesEnabled: z.boolean(),
	agentSystemPrompt: z.string().trim().max(20_000),
	// Presentation only, for every viewer; settings saved before this field existed read as "count".
	unreadBadgeStyle: unreadBadgeStyleSchema.default("count"),
	// Sender domains that every mailbox reads privately. Absent until an administrator saves it.
	privacy: emailPrivacySettingsSchema.optional(),
}).strict();

export type SystemSettings = z.infer<typeof systemSettingsSchema>;
