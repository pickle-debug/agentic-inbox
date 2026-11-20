import { useI18n } from "~/hooks/useI18n";
import { useUnreadBadgeStyle, type UnreadBadgeStyle } from "~/hooks/useUnreadBadgeStyle";

export default function UnreadBadge({count, label, style = "count", className = ""}: {count: number; label: string; style?: UnreadBadgeStyle; className?: string}) {
	const {t} = useI18n();
	if (count <= 0) return null;
	const description = t(`${label}: ${count} unread emails`, `${label}：${count} 封未读邮件`);
	return <span role="img" aria-label={description} title={description} className={`${style === "dot" ? "inline-block size-2.5 shrink-0 rounded-full bg-red-500" : "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-semibold leading-none text-white"} ${className}`}>{style === "count" ? count > 99 ? "99+" : count : null}</span>;
}

export function UnreadBadgePreference() {
	const {t} = useI18n();
	const {style, setStyle} = useUnreadBadgeStyle();
	return <label className="flex items-center justify-between gap-2 text-xs text-kumo-subtle" title={t("Saved in this browser only.", "仅保存在当前浏览器。")}>{t("Unread alerts", "未读提示")}<select aria-label={t("Unread alert style", "未读提示样式")} value={style} onChange={event => setStyle(event.target.value as UnreadBadgeStyle)} className="min-w-0 rounded-md border border-kumo-line bg-kumo-base px-2 py-1.5 text-xs text-kumo-default"><option value="count">{t("Red badge with count", "红点数字")}</option><option value="dot">{t("Red dot only", "仅红点")}</option></select></label>;
}
