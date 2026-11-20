import { z } from "zod";

const domainSchema = z.string().trim().toLowerCase().transform(value => value.replace(/\.$/, "")).pipe(
	z.string().max(253).regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/, "请输入有效的发件人域名，例如 example.com。"),
);

export const emailPrivacySettingsSchema = z.object({
	enabled: z.boolean(),
	domains: z.array(domainSchema).max(100, "最多配置 100 个发件人域名。").transform(domains => [...new Set(domains)]),
}).strict().refine(settings => !settings.enabled || settings.domains.length > 0, {
	path: ["domains"], message: "开启隐私模式前，请至少填写一个发件人域名。",
});

export type EmailPrivacySettings = z.infer<typeof emailPrivacySettingsSchema>;

/** Match the actual From address, never names, links, or a loose domain suffix. */
export function shouldUsePrivateReading(sender: string, settings: EmailPrivacySettings | undefined): boolean {
	if (settings === undefined) return false;
	const parsed = emailPrivacySettingsSchema.safeParse(settings);
	// A corrupt saved policy must not cause external images to load.
	if (!parsed.success) return true;
	if (!parsed.data.enabled) return false;
	const address = (sender.match(/<([^<>]+)>\s*$/)?.[1] ?? sender).trim().toLowerCase();
	const domain = address.slice(address.lastIndexOf("@") + 1).replace(/\.$/, "");
	if (!address.includes("@") || !domainSchema.safeParse(domain).success) return true;
	return parsed.data.domains.some(rule => domain === rule || domain.endsWith(`.${rule}`));
}
