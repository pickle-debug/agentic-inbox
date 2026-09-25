// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Badge, Banner, Button, Loader, Tooltip } from "@cloudflare/kumo";
import { ArrowLeftIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import MailboxSplitView from "~/components/MailboxSplitView";
import { formatListDate, getSnippetText } from "~/lib/utils";
import { useUpdateEmail } from "~/queries/emails";
import { useSearchEmails, SEARCH_PAGE_SIZE } from "~/queries/search";
import { useUIStore } from "~/hooks/useUIStore";
import type { Email } from "~/types";
import { useI18n } from "~/hooks/useI18n";

function highlightTerms(text: string, query: string): React.ReactNode {
	if (!query || !text) return text;
	const freeText = query.replace(/\b(?:from|to|subject|in|is|has|before|after):"[^"]*"/gi, "").replace(/\b(?:from|to|subject|in|is|has|before|after):\S+/gi, "").trim();
	if (!freeText) return text;
	try {
		const escaped = freeText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const regex = new RegExp(`(${escaped})`, "gi");
		const parts = text.split(regex);
		if (parts.length === 1) return text;
		// Use case-insensitive string comparison instead of regex.test() with g flag,
		// which has stateful lastIndex causing alternating true/false results.
		const lowerEscaped = escaped.toLowerCase();
		return parts.map((part, i) => part.toLowerCase() === lowerEscaped ? <mark key={i} className="bg-kumo-warning-muted text-kumo-default rounded-sm px-0.5">{part}</mark> : part);
	} catch { return text; }
}

export default function SearchResultsRoute() {
	const { t, dateLocale, folderName: localizeFolderName } = useI18n();
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const [searchParams] = useSearchParams();
	const navigate = useNavigate();
	const { selectedEmailId, isComposing, selectEmail, closePanel } = useUIStore();
	const updateEmail = useUpdateEmail();
	const urlQuery = searchParams.get("q") || "";
	const [page, setPage] = useState(1);
	const searchKey = useMemo(
		() => `${mailboxId ?? ""}::${urlQuery}`,
		[mailboxId, urlQuery],
	);
	const prevSearchKeyRef = useRef(searchKey);
	const searchChanged = prevSearchKeyRef.current !== searchKey;
	const currentPage = searchChanged ? 1 : page;
	const [editingPage, setEditingPage] = useState("1");
	useEffect(() => setEditingPage(String(currentPage)), [currentPage, searchKey]);

	useEffect(() => {
		if (!searchChanged) {
			return;
		}

		prevSearchKeyRef.current = searchKey;
		setPage(1);
		closePanel();
	}, [closePanel, searchChanged, searchKey]);

	const { data: searchData, isLoading, isFetching, isError, refetch } = useSearchEmails(
		mailboxId,
		urlQuery,
		currentPage,
	);
	const results = searchData?.results ?? [];
	const totalCount = searchData?.totalCount ?? 0;
	const totalPages = Math.max(1, Math.ceil(totalCount / SEARCH_PAGE_SIZE));
	const isPanelOpen = selectedEmailId !== null || isComposing;

	const handleRowClick = (email: Email) => { selectEmail(email.id); if (!email.read && mailboxId) updateEmail.mutate({ mailboxId, id: email.id, data: { read: true } }); };

	return (
		<MailboxSplitView
			selectedEmailId={selectedEmailId}
			isComposing={isComposing}
		>
			<>
				<div className="flex items-center gap-2 px-4 py-3.5 border-b border-kumo-line shrink-0 md:px-5">
					<Tooltip content={t("Back to inbox", "返回收件箱")} side="bottom" asChild><Button variant="ghost" shape="square" size="sm" icon={<ArrowLeftIcon size={18} />} onClick={() => navigate(`/mailbox/${mailboxId}/emails/inbox`)} aria-label={t("Back to inbox", "返回收件箱")} /></Tooltip>
					<div className="min-w-0 flex-1"><h1 className="text-lg font-semibold text-kumo-default truncate">{t("Search Results", "搜索结果")}</h1>{!isLoading && <span className="text-sm text-kumo-subtle">{t(`${totalCount} result${totalCount !== 1 ? "s" : ""}${urlQuery ? ` for "${urlQuery}"` : ""}`, `${urlQuery ? `“${urlQuery}”的` : ""}${totalCount} 条结果`)}</span>}</div>
				</div>
				<div className="flex-1 overflow-y-auto">
					{isLoading ? <div className="flex justify-center py-16" role="status" aria-label={t("Searching…", "正在搜索…")}><Loader size="lg" /></div> : isError ? (
						<div className="p-4 space-y-3">
							<Banner variant="error" text={t("Unable to search emails.", "邮件搜索失败。")} />
							<Button size="sm" variant="secondary" onClick={() => void refetch()}>{t("Retry", "重试")}</Button>
						</div>
					) : results.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-24 px-6 text-center">
							<div className="mb-4"><MagnifyingGlassIcon size={48} weight="thin" className="text-kumo-subtle" /></div>
							<h3 className="text-base font-semibold text-kumo-default mb-1.5">{t("No results found", "未找到结果")}</h3>
							<p className="text-sm text-kumo-subtle max-w-xs">{urlQuery ? t(`Nothing matched "${urlQuery}". Try different keywords or check your spelling.`, `未找到与“${urlQuery}”匹配的邮件。请尝试其他关键词或检查拼写。`) : t("Enter a search term to find emails by subject, sender, or content.", "输入关键词，按主题、发件人或正文搜索邮件。")}</p>
							{urlQuery && <p className="text-xs text-kumo-subtle mt-3 max-w-sm">{t("Tip: Use operators like ", "提示：可使用以下搜索语法 ")}<code className="bg-kumo-tint px-1 rounded">from:name</code>, <code className="bg-kumo-tint px-1 rounded">is:unread</code>, <code className="bg-kumo-tint px-1 rounded">has:attachment</code>, <code className="bg-kumo-tint px-1 rounded">before:2025-01-01</code></p>}
						</div>
					) : (
						<div>{results.map((email) => {
							const isSelected = selectedEmailId === email.id;
							const snippet = getSnippetText(email.snippet, 120);
							const folderName = (email as Email & { folder_name?: string }).folder_name;
							return (
								<div key={email.id} role="button" tabIndex={0} onClick={() => handleRowClick(email)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleRowClick(email); } }} className={`group flex items-center gap-3 w-full text-left cursor-pointer transition-colors border-b border-kumo-line px-4 py-2.5 md:px-5 md:py-3 ${isPanelOpen ? "md:px-4 md:py-2.5" : ""} ${isSelected ? "bg-kumo-tint" : "hover:bg-kumo-tint"}`}>
									<div className="w-2.5 shrink-0 flex justify-center">{!email.read && <div className="h-2 w-2 rounded-full bg-kumo-brand" />}</div>
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-2"><span className={`truncate text-sm ${!email.read ? "font-semibold text-kumo-default" : "text-kumo-strong"}`}>{highlightTerms(email.sender.split("@")[0], urlQuery)}</span>{folderName && <Badge variant="outline">{localizeFolderName(email.folder_id || "", folderName)}</Badge>}<span className="text-sm text-kumo-subtle shrink-0 ml-auto">{formatListDate(email.date, dateLocale)}</span></div>
										<div className={`truncate text-sm mt-0.5 ${!email.read ? "font-medium text-kumo-default" : "text-kumo-subtle"}`}>{highlightTerms(email.subject, urlQuery)}</div>
										{snippet && <div className="truncate text-xs text-kumo-subtle mt-0.5">{highlightTerms(snippet, urlQuery)}</div>}
									</div>
								</div>
							);
						})}</div>
					)}
				</div>
				{totalCount > SEARCH_PAGE_SIZE && (
					<nav aria-label={t("Pagination", "分页")} className="flex flex-wrap items-center justify-center gap-2 py-3 border-t border-kumo-line shrink-0">
						<Button size="sm" variant="ghost" disabled={currentPage <= 1 || isFetching} onClick={() => setPage(1)}>{t("First", "首页")}</Button>
						<Button size="sm" variant="ghost" disabled={currentPage <= 1 || isFetching} onClick={() => setPage(currentPage - 1)}>{t("Previous", "上一页")}</Button>
						<label className="flex items-center gap-1 text-sm text-kumo-subtle">
							{t("Page", "页码")}
							<input type="number" min={1} max={totalPages} value={editingPage} disabled={isFetching}
								onChange={(event) => setEditingPage(event.target.value)}
								onBlur={(event) => {
									const value = event.target.valueAsNumber;
									const next = Number.isFinite(value) ? Math.min(totalPages, Math.max(1, Math.trunc(value))) : currentPage;
									setEditingPage(String(next));
									setPage(next);
								}}
								onKeyDown={(event) => {
									if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
									if (event.key === "Escape") { event.preventDefault(); setEditingPage(String(currentPage)); }
								}}
								className="w-14 rounded border border-kumo-line bg-kumo-base px-1 py-1 text-center text-kumo-default" />
							{t(`of ${totalPages}`, `/ ${totalPages}`)}
						</label>
						<Button size="sm" variant="ghost" disabled={currentPage >= totalPages || isFetching} onClick={() => setPage(currentPage + 1)}>{t("Next", "下一页")}</Button>
						<Button size="sm" variant="ghost" disabled={currentPage >= totalPages || isFetching} onClick={() => setPage(totalPages)}>{t("Last", "末页")}</Button>
					</nav>
				)}
			</>
		</MailboxSplitView>
	);
}
