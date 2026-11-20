import { Button, Input } from "@cloudflare/kumo";
import { EnvelopeIcon, GearSixIcon, PencilSimpleIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { formatListDate } from "shared/dates";
import { useMailboxSummaries } from "~/queries/mailboxes";
import { supportsInlineCompose, useUIStore } from "~/hooks/useUIStore";
import { usePermissions } from "~/hooks/usePermissions";
import { useUnreadBadgeStyle } from "~/hooks/useUnreadBadgeStyle";
import { useI18n } from "~/hooks/useI18n";
import UnreadBadge, { UnreadBadgePreference } from "~/components/UnreadBadge";
import api from "~/services/api";
import type { MailboxSummary } from "~/types";

export const mailboxDomain = (email: string) => email.slice(email.lastIndexOf("@") + 1);

/** Chat-list order: newest Inbox mail first; mailboxes without mail stay alphabetical at the end. */
export function byLatestMail(a: MailboxSummary, b: MailboxSummary) {
	return (b.latestDate ?? "").localeCompare(a.latestDate ?? "") || a.email.localeCompare(b.email);
}

const unreadIn = (boxes: MailboxSummary[]) => boxes.reduce((total, box) => total + box.unreadCount, 0);

export default function MailboxRail({domain, onOpenTools}: {domain: string; onOpenTools?: () => void}) {
	const {t, dateLocale, message} = useI18n();
	const {mailboxId} = useParams();
	const {pathname} = useLocation();
	const {identity, admin, writable} = usePermissions();
	const query = useMailboxSummaries();
	const config = useQuery({queryKey: ["config"], queryFn: api.getConfig});
	const {style} = useUnreadBadgeStyle();
	const {closeSidebar, closePanel, closeComposeModal, startCompose, openComposeModal} = useUIStore();
	const navigate = useNavigate();
	const [search, setSearch] = useState("");
	const [error, setError] = useState("");
	const all = query.data ?? [];
	const boxes = all.filter(box => mailboxDomain(box.email) === domain).sort(byLatestMail);
	const domains = [...new Set([domain, ...(config.data?.domains ?? [])])].sort();
	const single = identity?.role === "mailbox" || (identity?.role === "share" && identity.scope === "mailbox");
	const needle = search.trim().toLowerCase();
	const shown = needle ? boxes.filter(box => box.email.toLowerCase().includes(needle) || box.name.toLowerCase().includes(needle)) : boxes;
	return <aside className="flex h-full w-full flex-col bg-kumo-recessed" aria-label={t("Domain mailboxes", "域名邮箱列表")}>
		<div className="space-y-3 border-b border-kumo-line p-4">
			<div className="flex items-center justify-between gap-2"><h2 className="min-w-0 truncate text-sm font-semibold" title={domain}>{domain}</h2><UnreadBadge count={unreadIn(boxes)} label={domain} style={style}/></div>
			{!single && domains.length > 1 && <div className="flex items-center gap-2">
				<select aria-label={t("Switch domain", "切换域名")} value={domain} className="min-w-0 flex-1 rounded-lg border border-kumo-line bg-kumo-base p-2 text-xs" onChange={event => {closePanel(); closeComposeModal(); closeSidebar(); navigate(`/domain/${encodeURIComponent(event.target.value)}`);}}>
					{domains.map(name => {const count = unreadIn(all.filter(box => mailboxDomain(box.email) === name)); return <option key={name} value={name}>{name}{count > 0 ? style === "count" ? ` (${count})` : " •" : ""}</option>;})}
				</select>
				{/* A closed <select> cannot show badges, so surface new mail in the other domains beside it. */}
				<UnreadBadge count={unreadIn(all.filter(box => mailboxDomain(box.email) !== domain))} label={t("Other domains", "其他域名")} style={style}/>
			</div>}
			{!single && <Input aria-label={t("Search domain mailboxes", "搜索域名邮箱")} placeholder={t("Search mailboxes", "搜索邮箱")} value={search} onChange={event => setSearch(event.target.value)} className="w-full"/>}
		</div>
		<nav aria-label={t("Mailboxes in this domain", "此域名下的邮箱")} className="min-h-0 flex-1 overflow-y-auto p-2">
			{query.isPending && <p role="status" className="p-3 text-xs text-kumo-subtle">{t("Loading mailboxes…", "正在加载邮箱…")}</p>}
			{query.error && <div className="space-y-2 p-3"><p role="alert" className="text-xs text-kumo-error">{message(query.error.message)}</p><Button size="xs" onClick={() => query.refetch()}>{t("Retry", "重试")}</Button></div>}
			{shown.map(box => <Link key={box.id} to={`/mailbox/${encodeURIComponent(box.id)}/emails/inbox`} title={box.email} aria-current={box.id === mailboxId ? "page" : undefined} onClick={() => {if (box.id !== mailboxId) {closePanel(); closeComposeModal();} closeSidebar();}} className={`mb-1 flex items-start gap-3 rounded-lg px-3 py-2.5 no-underline ${box.id === mailboxId ? "bg-kumo-fill text-kumo-default" : "text-kumo-strong hover:bg-kumo-tint"}`}>
				<span className="relative mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-kumo-base">
					<EnvelopeIcon size={18}/>
					<UnreadBadge count={box.unreadCount} label={box.email} style={style} className={`absolute ring-2 ring-kumo-recessed ${style === "dot" ? "-right-0.5 -top-0.5" : "-right-2 -top-2"}`}/>
				</span>
				<span className="min-w-0 flex-1">
					<span className="flex items-baseline justify-between gap-2">
						<span className={`truncate text-sm ${box.unreadCount > 0 ? "font-semibold text-kumo-default" : "font-medium"}`}>{box.name && box.name !== box.email ? box.name : box.email.split("@")[0]}</span>
						{box.latestDate && <span className="shrink-0 text-[11px] text-kumo-subtle">{formatListDate(box.latestDate, dateLocale)}</span>}
					</span>
					<span className="mt-0.5 block truncate text-[11px] text-kumo-subtle">{box.email}</span>
					{box.latestSubject && <span className="mt-1 block truncate text-xs text-kumo-subtle">{box.latestSubject}</span>}
				</span>
			</Link>)}
			{!query.isPending && !query.error && boxes.length === 0 && <p className="p-3 text-xs text-kumo-subtle">{t("Waiting for the first mailbox…", "等待首封来信创建邮箱…")}</p>}
			{needle && boxes.length > 0 && shown.length === 0 && <p className="p-3 text-xs text-kumo-subtle">{t("No matching mailboxes.", "没有匹配的邮箱。")}</p>}
		</nav>
		<div className="shrink-0 space-y-3 border-t border-kumo-line p-3">
			{/* Settings and contacts have no inline composer, so they need the compose dialog. */}
			{mailboxId && writable && <Button size="sm" variant="primary" className="w-full" icon={<PencilSimpleIcon size={16}/>} onClick={() => {if (supportsInlineCompose(pathname)) startCompose(); else openComposeModal(); closeSidebar();}}>{t("Compose", "写邮件")}</Button>}
			{onOpenTools && <Button size="sm" variant="ghost" className="w-full" icon={<GearSixIcon size={16}/>} onClick={() => {closeSidebar(); onOpenTools();}}>{t("Mailbox tools", "文件夹与邮箱操作")}</Button>}
			<UnreadBadgePreference/>
			<div className="flex items-center justify-between gap-2 text-xs">{admin ? <Link to={`/?domain=${encodeURIComponent(domain)}&overview=1`} className="text-kumo-subtle underline">{t("Manage domains", "域名管理")}</Link> : <span className="text-kumo-subtle">{identity?.role === "share" && identity.permission === "read" ? t("Read only", "只读访问") : t("Mailbox", "邮箱")}</span>}<button type="button" className="rounded px-1 py-1 text-kumo-subtle hover:text-kumo-default" onClick={async () => {try {const result = await api.logout(); window.location.replace(result.redirect);} catch(err) {setError(err instanceof Error ? err.message : t("Sign out failed.", "退出失败。"));}}}>{t("Sign out", "退出登录")}</button></div>
			{error && <p role="alert" className="text-xs text-kumo-error">{message(error)}</p>}
		</div>
	</aside>;
}
