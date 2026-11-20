// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useEffect, useRef } from "react";
import { Outlet, useParams } from "react-router";
import AgentSidebar from "~/components/AgentSidebar";
import ComposeEmail from "~/components/ComposeEmail";
import Header from "~/components/Header";
import Sidebar from "~/components/Sidebar";
import MailboxRail from "~/components/MailboxRail";
import { useMailbox } from "~/queries/mailboxes";
import { useUIStore } from "~/hooks/useUIStore";
import { usePermissions } from "~/hooks/usePermissions";
import { useI18n } from "~/hooks/useI18n";

export default function MailboxRoute() {
	const { t } = useI18n();
	const {identity, shared, writable} = usePermissions();
	const { mailboxId } = useParams<{ mailboxId: string }>();
	// Prefetch mailbox data for child components
	useMailbox(mailboxId);
	const prevMailboxIdRef = useRef<string | undefined>(undefined);
	const {
		isSidebarOpen,
		closeSidebar,
		isAgentPanelOpen,
		closePanel,
		closeComposeModal,
		toggleAgentPanel,
	} = useUIStore();

	useEffect(() => () => closeSidebar(), [closeSidebar]);

	useEffect(() => {
		if (
			prevMailboxIdRef.current &&
			mailboxId &&
			prevMailboxIdRef.current !== mailboxId
		) {
			closePanel();
			closeComposeModal();
			closeSidebar();
		}

		prevMailboxIdRef.current = mailboxId;
	}, [mailboxId, closeComposeModal, closePanel, closeSidebar]);

	return (
		<div className="relative flex h-[calc(100dvh-3.5rem)] overflow-hidden">
			{/* Mobile sidebar overlay backdrop */}
			{isSidebarOpen && (
				<div
					className="fixed inset-x-0 bottom-0 top-14 z-30 bg-black/30 md:hidden"
					onClick={closeSidebar}
					onKeyDown={(e) => e.key === "Escape" && closeSidebar()}
					role="button"
					tabIndex={-1}
					aria-label={t("Close sidebar", "关闭侧栏")}
				/>
			)}

			{/* Mailboxes of this domain, then the open mailbox's folders. Phones show both in one
			    overlay from the menu button; wider screens keep them as fixed columns. */}
			<div
				className={`fixed bottom-0 top-14 left-0 z-40 flex w-[calc(100vw-3rem)] max-w-md transform transition-transform duration-200 ease-in-out md:relative md:top-auto md:bottom-auto md:z-0 md:w-auto md:max-w-none md:translate-x-0 ${
					isSidebarOpen ? "translate-x-0" : "-translate-x-full"
				}`}
			>
				<div className="min-w-0 flex-[1.2] border-r border-kumo-line md:w-60 md:flex-none">
					<MailboxRail domain={mailboxId?.split("@")[1] || ""} />
				</div>
				<div className="min-w-0 flex-1 md:w-52 md:flex-none">
					<Sidebar />
				</div>
			</div>

			{/* Main content */}
			<div className="flex-1 flex flex-col min-w-0 bg-kumo-base">
				<Header />
				<main className="flex-1 overflow-hidden">
					<Outlet />
				</main>
			</div>

			{/* Agent + MCP sidebar -- togglable on desktop */}
			{isAgentPanelOpen && identity && !shared && (
				<div className="absolute inset-y-0 right-0 z-30 hidden w-[380px] max-w-full flex-col overflow-hidden border-l border-kumo-line bg-kumo-base shadow-xl lg:flex">
					<button type="button" className="absolute right-2 top-2 z-10 rounded px-2 py-1 text-kumo-subtle hover:bg-kumo-tint" onClick={toggleAgentPanel} aria-label={t("Close agent panel", "关闭助手面板")}>×</button>
					<AgentSidebar />
				</div>
			)}

			{writable && <ComposeEmail />}
		</div>
	);
}
