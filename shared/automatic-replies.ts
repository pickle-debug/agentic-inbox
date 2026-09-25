import { z } from "zod";

export const autoReplySettingsSchema = z.object({
	enabled: z.boolean().default(false),
	subject: z.string().regex(/^[^\r\n]*$(?![\s\S])/, "The reply subject must be a single line.").trim().max(200).default(""),
	message: z.string().trim().max(10_000).default(""),
}).superRefine((settings, ctx) => {
	if (settings.enabled && !settings.message) {
		ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["message"], message: "Enter a message before enabling automatic replies." });
	}
});

export type AutoReplySettings = z.infer<typeof autoReplySettingsSchema>;
