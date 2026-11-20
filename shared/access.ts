import { z } from "zod";

export const domainNameSchema = z
	.string()
	.trim()
	.toLowerCase()
	.max(253)
	.regex(
		/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/,
		"请输入有效的域名，例如 example.com。",
	);
export const mailboxAddressSchema = z.string().trim().toLowerCase().email().max(254);
export const shareInputSchema = z
	.object({
		scope: z.enum(["domain", "mailbox"]),
		target: z.string().trim().toLowerCase().max(254),
		permission: z.enum(["read", "write", "manage"]),
		label: z.string().trim().min(1).max(100),
		days: z.number().int().min(1).max(365),
	})
	.strict()
	.superRefine((value, ctx) => {
		if (
			!(value.scope === "domain" ? domainNameSchema : mailboxAddressSchema).safeParse(value.target)
				.success
		)
			ctx.addIssue({ code: "custom", path: ["target"], message: "请填写有效的分享域名或邮箱。" });
	});
export type ShareInput = z.infer<typeof shareInputSchema>;
export type SharePermission = ShareInput["permission"];
export type ShareInfo = {
	id: string;
	scope: "domain" | "mailbox";
	target: string;
	permission: SharePermission;
	label: string;
	created: number;
	expires: number;
};
export type Identity =
	| { role: "admin"; email: string; expires: number }
	| { role: "mailbox"; email: string; expires: number }
	| {
			role: "share";
			email: string;
			expires: number;
			scope: "domain" | "mailbox";
			target: string;
			permission: SharePermission;
			keyId: string;
	  };
// 域名授权动态包含未来新增的邮箱，但不包含子域名或相似后缀；不能用 endsWith(target)。
export function canAccessMailbox(identity: Identity, mailbox: string) {
	if (identity.role === "admin") return true;
	if (identity.role === "mailbox") return identity.email === mailbox;
	return identity.scope === "mailbox"
		? identity.target === mailbox
		: mailbox.slice(mailbox.lastIndexOf("@") + 1) === identity.target;
}
export function canWrite(identity: Identity | undefined) {
	return !!identity && (identity.role !== "share" || identity.permission !== "read");
}
export function canDelete(identity: Identity | undefined) {
	return !!identity && (identity.role !== "share" || identity.permission === "manage");
}
