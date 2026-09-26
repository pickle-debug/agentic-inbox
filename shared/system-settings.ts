import { z } from "zod";

export const systemSettingsSchema = z.object({
	autoDraftRepliesEnabled: z.boolean(),
	agentSystemPrompt: z.string().trim().max(20_000),
}).strict();

export type SystemSettings = z.infer<typeof systemSettingsSchema>;
