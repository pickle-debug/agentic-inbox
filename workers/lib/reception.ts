import { receptionSchema, type ReceptionSettings } from "../../shared/reception";
import type { Env } from "../types";

export const RECEPTION_KEY = "settings/reception.json";
/**
 * 每次读取已保存策略，使系统设置无需重新部署即可生效。
 * 仅首次未保存时回退到 DOMAINS；损坏的策略应报错，不能悄悄放开接收范围。
 */
export async function getReception(
	env: Pick<Env, "BUCKET" | "DOMAINS">,
): Promise<ReceptionSettings> {
	const object = await env.BUCKET.get(RECEPTION_KEY);
	return receptionSchema.parse(
		object
			? await object.json()
			: {
					mode: "listed",
					domains: (env.DOMAINS || "")
						.split(",")
						.map((value) => value.trim())
						.filter(Boolean),
					autoCreate: false,
				},
	);
}
// 首封来信只建立存储所需配置，不能替用户开启自动转发或固定回复。
// AI 草稿是否生成仍由独立的全局系统设置控制。
export function defaultMailboxSettings(name: string) {
	return {
		fromName: name,
		privacy: { enabled: false, domains: [] },
		forwarding: { enabled: false, email: "" },
		signature: { enabled: false, text: "" },
		autoReply: { enabled: false, subject: "", message: "" },
	};
}
