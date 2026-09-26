import { Button, Loader } from "@cloudflare/kumo";
import { Navigate, useLocation } from "react-router";
import { useI18n } from "~/hooks/useI18n";
import { useMailboxes } from "~/queries/mailboxes";
import Header from "~/components/Header";
import ContactsRoute from "./contacts";

// Keep existing bookmarks working inside the shared mailbox layout.
export default function ContactsIndexRoute() {
	const { t, message } = useI18n();
	const { search } = useLocation();
	const mailboxes = useMailboxes();
	if (mailboxes.isError) return <div className="flex flex-col items-center gap-4 p-8">
		<p role="alert">{message(mailboxes.error.message)}</p>
		<Button onClick={() => void mailboxes.refetch()} loading={mailboxes.isFetching}>{t("Retry", "重试")}</Button>
	</div>;
	if (mailboxes.isPending) return <div role="status" aria-label={t("Loading mailboxes", "加载邮箱")} className="flex justify-center p-8"><Loader /></div>;
	const mailbox = mailboxes.data[0];
	if (mailbox) return <Navigate to={`/mailbox/${encodeURIComponent(mailbox.id)}/contacts${search}`} replace />;
	// Administrators can still manage the shared directory before creating a mailbox.
	return <div className="flex h-[calc(100dvh-3.5rem)] flex-col bg-kumo-base">
		<Header />
		<main className="min-h-0 flex-1 overflow-hidden"><ContactsRoute /></main>
	</div>;
}
