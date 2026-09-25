import { z } from "zod";

export const contactInputSchema = z.object({
	name: z.string().trim().min(1, "请填写联系人姓名。").max(120, "姓名最多 120 个字符。"),
	email: z.string().trim().email("请输入有效的邮箱地址。").max(254).transform(value => value.toLowerCase()),
	notes: z.string().trim().max(1000, "备注最多 1000 个字符。").default(""),
	introduction: z.string().trim().max(4000, "介绍最多 4000 个字符。").default(""),
});

export type ContactInput = z.infer<typeof contactInputSchema>;
export type Contact = ContactInput & { id: string; createdAt: string; updatedAt: string };
export type ContactList = { contacts: Contact[]; totalCount: number };
