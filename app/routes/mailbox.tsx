// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@cloudflare/kumo";
import { Outlet, useLocation, useParams } from "react-router";
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
	const {pathname} = useLocation();
	const [toolsOpen, setToolsOpen] = useState(false);
	// Prefetch mailbox data for child components
	useMailbox(mailboxId);
	const prevMailboxIdRef = useRef<string | undefined>(undefined);
	const {
		isSidebarOpen,
		closeSidebar,
		isAgentPanelOpen,
		closePanel,
		closeComposeModal,
		isComposing,
		toggleAgentPanel,
	} = useUIStore();

	useEffect(() => () => closeSidebar(), [closeSidebar]);
	useEffect(() => {setToolsOpen(false);}, [pathname, isComposing]);

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

			{/* Sidebar: hidden on mobile by default, shown as overlay when open */}
			<div
				className={`fixed bottom-0 top-14 left-0 z-40 w-64 transform transition-transform duration-200 ease-in-out md:relative md:top-auto md:bottom-auto md:translate-x-0 md:z-0 ${
					isSidebarOpen ? "translate-x-0" : "-translate-x-full"
				}`}
			>
				<MailboxRail domain={mailboxId?.split("@")[1] || ""} onOpenTools={() => setToolsOpen(true)} />
			</div>

			{/* Main content */}
			<div className="flex-1 flex flex-col min-w-0 bg-kumo-base">
				<Header onOpenTools={() => setToolsOpen(true)} />
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
			<Dialog.Root open={toolsOpen} onOpenChange={setToolsOpen}><Dialog size="sm" className="max-h-[85dvh] overflow-hidden p-0"><Dialog.Title className="sr-only">{t("Mailbox tools", "文件夹与邮箱操作")}</Dialog.Title><button type="button" onClick={() => setToolsOpen(false)} aria-label={t("Close mailbox tools", "关闭邮箱操作")} className="absolute right-2 top-2 z-10 rounded px-2 py-1 text-kumo-subtle hover:bg-kumo-tint">×</button><div className="h-[75dvh]" onClick={event => {if ((event.target as HTMLElement).closest("a")) setToolsOpen(false);}}><Sidebar /></div></Dialog></Dialog.Root>
		</div>
	);
}
