import { useI18n } from "~/hooks/useI18n";
import type { UnreadBadgeStyle } from "~/hooks/useUnreadBadgeStyle";

export default function UnreadBadge({count, label, style = "count", className = ""}: {count: number; label: string; style?: UnreadBadgeStyle; className?: string}) {
	const {t} = useI18n();
	if (count <= 0) return null;
	const description = t(`${label}: ${count} unread emails`, `${label}：${count} 封未读邮件`);
	return <span role="img" aria-label={description} title={description} className={`${style === "dot" ? "inline-block size-2.5 shrink-0 rounded-full bg-red-500" : "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-semibold leading-none text-white"} ${className}`}>{style === "count" ? count > 99 ? "99+" : count : null}</span>;
}
