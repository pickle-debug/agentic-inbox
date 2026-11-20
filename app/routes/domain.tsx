import { Navigate, useParams } from "react-router";
import { useMailboxSummaries } from "~/queries/mailboxes";
import { usePermissions } from "~/hooks/usePermissions";
import { useI18n } from "~/hooks/useI18n";
import MailboxRail, { byLatestMail, mailboxDomain } from "~/components/MailboxRail";

/** Stable entry for domain shares: enter the workspace without a second mailbox-picker page. */
export default function DomainRoute() {
	const {domain = ""} = useParams();
	const {identity} = usePermissions();
	const {t} = useI18n();
	const query = useMailboxSummaries();
	if (identity?.role === "mailbox" || (identity?.role === "share" && identity.scope === "mailbox")) return <Navigate to={`/mailbox/${encodeURIComponent(identity.email)}/emails/inbox`} replace/>;
	if (identity?.role === "share" && identity.target !== domain) return <Navigate to={`/domain/${encodeURIComponent(identity.target)}`} replace/>;
	// Same order as the rail, so the newest unread mailbox opens first.
	const boxes = (query.data ?? []).filter(box => mailboxDomain(box.email) === domain).sort(byLatestMail);
	const initial = boxes.find(box => box.unreadCount > 0) ?? boxes[0];
	if (initial) return <Navigate to={`/mailbox/${encodeURIComponent(initial.id)}/emails/inbox`} replace/>;
	return <div className="flex h-[calc(100dvh-3.5rem)] overflow-hidden"><div className="w-full shrink-0 md:w-64"><MailboxRail domain={domain}/></div><main className="hidden flex-1 items-center justify-center p-8 text-sm text-kumo-subtle md:flex">{query.isPending ? t("Loading mailboxes…", "正在加载邮箱…") : t("New mailboxes will appear here when mail arrives.", "新邮件到达后，邮箱会自动显示在这里。")}</main></div>;
}
