import { z } from "zod";

export function forwardingSettingsSchema(mailboxId: string) {
	return z.object({
		enabled: z.boolean().default(false),
		email: z.string().trim().transform((email) => email.toLowerCase()).default(""),
	}).superRefine((settings, ctx) => {
		// Disabling forwarding must remain possible even when a saved destination is no longer valid.
		if (!settings.enabled) return;
		if (!z.string().email().max(254).safeParse(settings.email).success) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["email"], message: "Enter a valid forwarding email address." });
		} else if (settings.email === mailboxId.trim().toLowerCase()) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["email"], message: "Forwarding to the same mailbox is not allowed." });
		}
	});
}
