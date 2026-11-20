import { Button } from "@cloudflare/kumo";
import { useState } from "react";
import { Navigate, useParams } from "react-router";
import { useMailboxSummaries } from "~/queries/mailboxes";
import { usePermissions } from "~/hooks/usePermissions";
import { useI18n } from "~/hooks/useI18n";
import MailboxRail, { byLatestMail, mailboxDomain } from "~/components/MailboxRail";
import api from "~/services/api";

/** Stable entry for domain shares: enter the workspace without a second mailbox-picker page. */
export default function DomainRoute() {
	const {domain = ""} = useParams();
	const {identity} = usePermissions();
	const {t, message} = useI18n();
	const query = useMailboxSummaries();
	const [error, setError] = useState("");
	if (identity?.role === "mailbox" || (identity?.role === "share" && identity.scope === "mailbox")) return <Navigate to={`/mailbox/${encodeURIComponent(identity.email)}/emails/inbox`} replace/>;
	if (identity?.role === "share" && identity.target !== domain) return <Navigate to={`/domain/${encodeURIComponent(identity.target)}`} replace/>;
	// Same order as the rail, so the newest unread mailbox opens first.
	const boxes = (query.data ?? []).filter(box => mailboxDomain(box.email) === domain).sort(byLatestMail);
	const initial = boxes.find(box => box.unreadCount > 0) ?? boxes[0];
	if (initial) return <Navigate to={`/mailbox/${encodeURIComponent(initial.id)}/emails/inbox`} replace/>;
	const signOut = async () => {
		try {
			const result = await api.logout();
			window.location.replace(result.redirect);
		} catch (err) {
			setError(err instanceof Error ? err.message : t("Sign out failed.", "退出失败。"));
		}
	};
	return <div className="flex h-[calc(100dvh-3.5rem)] flex-col overflow-hidden md:flex-row">
		<div className="min-h-0 flex-1 md:w-60 md:flex-none md:border-r md:border-kumo-line"><MailboxRail domain={domain}/></div>
		<main className="flex shrink-0 flex-col items-center justify-center gap-3 border-t border-kumo-line p-6 text-center text-sm text-kumo-subtle md:flex-1 md:border-t-0 md:p-8">
			<p>{query.isPending ? t("Loading mailboxes…", "正在加载邮箱…") : t("New mailboxes will appear here when mail arrives.", "新邮件到达后，邮箱会自动显示在这里。")}</p>
			{/* Administrators leave through the top logo; visitors have no other page with a sign-out button. */}
			{identity && identity.role !== "admin" && <Button size="sm" variant="secondary" onClick={signOut}>{t("Sign out", "退出登录")}</Button>}
			{error && <p role="alert" className="text-xs text-kumo-error">{message(error)}</p>}
		</main>
	</div>;
}
