import { z } from "zod";
import { domainNameSchema } from "./access";

export const receptionSchema = z
	.object({
		mode: z.enum(["listed", "all"]),
		domains: z
			.array(domainNameSchema)
			.max(200)
			.transform((values) => [...new Set(values)]),
		autoCreate: z.boolean(),
	})
	.strict();
export type ReceptionSettings = z.infer<typeof receptionSchema>;
// 收件域名精确匹配，不继承子域名；这里的策略不替代 Cloudflare 的 MX/Email Routing。
export function acceptsDomain(settings: ReceptionSettings, domain: string) {
	return (
		domainNameSchema.safeParse(domain).success &&
		(settings.mode === "all" || settings.domains.includes(domain))
	);
}
