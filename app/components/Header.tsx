// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Input, Tooltip } from "@cloudflare/kumo";
import { ListIcon, MagnifyingGlassIcon, RobotIcon, XIcon } from "@phosphor-icons/react";
import { type KeyboardEvent, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { useUIStore } from "~/hooks/useUIStore";
import { useI18n } from "~/hooks/useI18n";

export default function Header() {
	const { t } = useI18n();
	const [searchQuery, setSearchQuery] = useState("");
	const [isSearchExpanded, setIsSearchExpanded] = useState(false);
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const navigate = useNavigate();
	const location = useLocation();
	const pathname = location.pathname.replace(/\/+$/, "");
	const isContacts = pathname.endsWith("/contacts");
	const [searchParams] = useSearchParams();
	const { toggleSidebar, toggleAgentPanel, isAgentPanelOpen } = useUIStore();

	// Sync search input with URL query param so it stays populated
	const urlQuery = searchParams.get("q") || "";
	useEffect(() => {
		setSearchQuery(isContacts || pathname.endsWith("/search") ? urlQuery : "");
	}, [urlQuery, pathname, isContacts]);

	const performSearch = () => {
		if (isContacts || (mailboxId && searchQuery.trim())) {
			const q = searchQuery.trim();
			const path = isContacts ? location.pathname : `/mailbox/${encodeURIComponent(mailboxId!)}/search`;
			navigate(`${path}${q ? `?q=${encodeURIComponent(q)}` : ""}`);
			setIsSearchExpanded(false);
		}
	};

	const clearSearch = () => {
		setSearchQuery("");
		if (isContacts) {
			navigate(location.pathname);
		} else if (location.pathname.includes("/search") && mailboxId) {
			navigate(`/mailbox/${mailboxId}/emails/inbox`);
		}
	};

	const handleKeyDown = (e: KeyboardEvent) => {
		if (e.key === "Enter") {
			performSearch();
		}
		if (e.key === "Escape") {
			if (searchQuery) {
				clearSearch();
			} else {
				setIsSearchExpanded(false);
			}
		}
	};

	return (
		<header className="flex items-center gap-2 px-3 py-2.5 bg-kumo-base border-b border-kumo-line sticky top-0 z-10 md:px-5 md:gap-4">
			{/* Hamburger menu - mobile only */}
			{mailboxId && <Button
				variant="ghost"
				shape="square"
				size="sm"
				icon={<ListIcon size={20} />}
				onClick={toggleSidebar}
				aria-label={t("Toggle sidebar", "切换侧边栏")}
				className="md:hidden shrink-0"
			/>}

			{/* Search - full on desktop, collapsible on mobile */}
			<div
				className={`flex-1 max-w-lg transition-all flex items-center gap-1 ${
					isSearchExpanded ? "flex" : "hidden md:flex"
				}`}
			>
				<div className="flex-1 relative flex items-center">
					<Input
						className="w-full"
						aria-label={isContacts ? t("Search contacts", "搜索联系人") : t("Search emails", "搜索邮件")}
						placeholder={isContacts ? t("Search name, email, notes or introduction", "搜索姓名、邮箱、备注或介绍") : t("Search emails... (try from:name, is:unread, has:attachment)", "搜索邮件…（可用 from:name、is:unread、has:attachment）")}
						maxLength={isContacts ? 200 : undefined}
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						onKeyDown={handleKeyDown}
					/>
					{searchQuery && (
						<button
							type="button"
							onClick={clearSearch}
							className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-kumo-subtle hover:text-kumo-default hover:bg-kumo-tint transition-colors"
							aria-label={t("Clear search", "清空搜索")}
						>
							<XIcon size={14} />
						</button>
					)}
				</div>
				<Tooltip content={t("Search", "搜索")} side="bottom" asChild>
					<Button
						variant="ghost"
						shape="square"
						icon={<MagnifyingGlassIcon size={20} />}
						onClick={performSearch}
						aria-label={t("Search", "搜索")}
					/>
				</Tooltip>
			</div>

			{/* Search toggle button - mobile only, hidden when search is expanded */}
			{!isSearchExpanded && (
				<Button
					variant="ghost"
					shape="square"
					size="sm"
					icon={<MagnifyingGlassIcon size={20} />}
					onClick={() => setIsSearchExpanded(true)}
					aria-label={t("Search", "搜索")}
					className="md:hidden shrink-0"
				/>
			)}

			{mailboxId && <div className="flex items-center gap-1 ml-auto shrink-0">
				<Tooltip content={isAgentPanelOpen ? t("Hide agent panel", "隐藏助手面板") : t("Show agent panel", "显示助手面板")} side="bottom" asChild>
					<Button
						variant={isAgentPanelOpen ? "secondary" : "ghost"}
						shape="square"
						icon={<RobotIcon size={20} />}
						onClick={toggleAgentPanel}
						aria-label={t("Toggle agent panel", "切换助手面板")}
						className="hidden lg:inline-flex"
					/>
				</Tooltip>
			</div>}
		</header>
	);
}
