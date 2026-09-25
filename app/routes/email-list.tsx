// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Banner, Button, Tooltip } from "@cloudflare/kumo";
import {
	ArchiveIcon,
	ArrowBendUpLeftIcon,
	ArrowsClockwiseIcon,
	EnvelopeOpenIcon,
	EnvelopeSimpleIcon,
	FileIcon,
	PaperPlaneTiltIcon,
	PencilSimpleIcon,
	StarIcon,
	TrashIcon,
	TrayIcon,
} from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router";
import { Folders } from "shared/folders";
import { formatListDate } from "shared/dates";
import MailboxSplitView from "~/components/MailboxSplitView";
import { getSnippetText } from "~/lib/utils";
import {
	useDeleteEmail,
	useEmails,
	useMarkThreadRead,
	useUpdateEmail,
} from "~/queries/emails";
import { useFolders } from "~/queries/folders";
import { queryKeys } from "~/queries/keys";
import { useUIStore } from "~/hooks/useUIStore";
import type { Email } from "~/types";
import { useI18n } from "~/hooks/useI18n";

const PAGE_SIZE = 25;

function getFolderEmptyStates(t: (english: string, chinese: string) => string): Record<
	string,
	{
		icon: React.ReactNode;
		title: string;
		description: string;
		showCompose?: boolean;
	}
> { return {
	[Folders.INBOX]: {
		icon: <TrayIcon size={48} weight="thin" className="text-kumo-subtle" />,
		title: t("Your inbox is empty", "收件箱为空"),
		description:
			t("New emails will appear here when they arrive. Send an email to get the conversation started.", "收到的新邮件会显示在这里。发送一封邮件，开启对话吧。"),
		showCompose: true,
	},
	[Folders.SENT]: {
		icon: (
			<PaperPlaneTiltIcon size={48} weight="thin" className="text-kumo-subtle" />
		),
		title: t("No sent emails", "暂无已发送邮件"),
		description: t("Emails you send will show up here.", "您发送的邮件会显示在这里。"),
		showCompose: true,
	},
	[Folders.DRAFT]: {
		icon: <FileIcon size={48} weight="thin" className="text-kumo-subtle" />,
		title: t("No drafts", "暂无草稿"),
		description: t("Emails you're still working on will be saved here.", "尚未写完的邮件会保存在这里。"),
		showCompose: true,
	},
	[Folders.ARCHIVE]: {
		icon: <ArchiveIcon size={48} weight="thin" className="text-kumo-subtle" />,
		title: t("Archive is empty", "归档为空"),
		description:
			t("Move emails here to keep your inbox clean without deleting them.", "将邮件移到这里，保留邮件并整理收件箱。"),
	},
	[Folders.TRASH]: {
		icon: <TrashIcon size={48} weight="thin" className="text-kumo-subtle" />,
		title: t("Trash is empty", "回收站为空"),
		description:
			t("Deleted emails will appear here. You can restore them or permanently delete them.", "删除的邮件会显示在这里，您可以恢复或永久删除。"),
	},
}; }

function EmailListSkeleton() {
	const { t } = useI18n();
	return (
		<div className="animate-pulse space-y-1 p-2" role="status" aria-label={t("Loading emails…", "正在加载邮件…")}>
			{Array.from({ length: 8 }).map((_, i) => (
				<div key={i} className="flex items-center gap-3 px-3 py-3">
					<div className="w-4 h-4 rounded bg-kumo-fill" />
					<div className="w-5 h-5 rounded bg-kumo-fill" />
					<div className="flex-1 space-y-2">
						<div className="flex items-center gap-2">
							<div className="h-3 w-24 rounded bg-kumo-fill" />
							<div className="h-3 w-4 rounded bg-kumo-fill" />
							<div className="h-3 flex-1 rounded bg-kumo-fill" />
							<div className="h-3 w-12 rounded bg-kumo-fill" />
						</div>
						<div className="h-2.5 w-3/4 rounded bg-kumo-fill" />
					</div>
				</div>
			))}
		</div>
	);
}

function FolderEmptyState({
	folder,
	onCompose,
}: {
	folder?: string;
	onCompose: () => void;
}) {
	const { t } = useI18n();
	const config = (folder && getFolderEmptyStates(t)[folder]) || {
		icon: (
			<EnvelopeSimpleIcon size={48} weight="thin" className="text-kumo-subtle" />
		),
		title: t("No emails", "暂无邮件"),
		description: t("This folder is empty.", "此文件夹为空。"),
	};

	return (
		<div className="flex flex-col items-center justify-center py-24 px-6 text-center">
			<div className="mb-4">{config.icon}</div>
			<h3 className="text-base font-semibold text-kumo-default mb-1.5">
				{config.title}
			</h3>
			<p className="text-sm text-kumo-subtle max-w-xs mb-5">
				{config.description}
			</p>
			{"showCompose" in config && config.showCompose && (
				<Button
					variant="primary"
					size="sm"
					icon={<PencilSimpleIcon size={16} />}
					onClick={onCompose}
				>
					{t("Compose", "写邮件")}
				</Button>
			)}
		</div>
	);
}

export default function EmailListRoute() {
	const { t, dateLocale, folderName: localizeFolderName } = useI18n();
	const { mailboxId, folder } = useParams<{
		mailboxId: string;
		folder: string;
	}>();
	const {
		selectedEmailId,
		isComposing,
		selectEmail,
		closePanel,
		startCompose,
	} = useUIStore();
	const [page, setPage] = useState(1);
	const [editingPage, setEditingPage] = useState("1");
	useEffect(() => setEditingPage(String(page)), [page, mailboxId, folder]);

	const queryClient = useQueryClient();
	const updateEmail = useUpdateEmail();
	const markThreadRead = useMarkThreadRead();
	const deleteEmail = useDeleteEmail();

	const params = useMemo(
		() => ({
			folder: folder || "",
			page: String(page),
			limit: String(PAGE_SIZE),
		}),
		[folder, page],
	);

	const {
		data: emailData,
		isFetching: isRefreshing,
		isError,
		refetch,
	} = useEmails(mailboxId, params, { refetchInterval: 30_000 });

	const emails = emailData?.emails ?? [];
	const totalCount = emailData?.totalCount ?? 0;
	const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

	const { data: folders = [] } = useFolders(mailboxId);

	const folderName = useMemo(() => {
		const found = folders.find((f) => f.id === folder);
		return localizeFolderName(folder || Folders.INBOX, found?.name);
	}, [folders, folder, localizeFolderName]);

	const isPanelOpen = selectedEmailId !== null || isComposing;

	// Track folder identity to detect folder changes vs page changes
	const prevFolderRef = useRef<string | undefined>(undefined);

	useEffect(() => {
		const folderChanged = prevFolderRef.current !== `${mailboxId}/${folder}`;
		prevFolderRef.current = `${mailboxId}/${folder}`;

		if (folderChanged) {
			closePanel();
			setPage(1);
		}
	}, [mailboxId, folder, closePanel]);

	const toggleStar = (e: React.MouseEvent, email: Email) => {
		e.preventDefault();
		e.stopPropagation();
		if (mailboxId)
			updateEmail.mutate({
				mailboxId,
				id: email.id,
				data: { starred: !email.starred },
			});
	};

	const handleDelete = (e: React.MouseEvent, emailId: string) => {
		e.preventDefault();
		e.stopPropagation();
		if (mailboxId) {
			const confirmed = window.confirm(t("Are you sure you want to delete this email?", "确定要删除这封邮件吗？"));
			if (!confirmed) return;
			deleteEmail.mutate({ mailboxId, id: emailId });
			if (selectedEmailId === emailId) closePanel();
		}
	};

	const handleRefresh = () => {
		if (mailboxId) {
			queryClient.invalidateQueries({ queryKey: ["emails", mailboxId] });
			queryClient.invalidateQueries({
				queryKey: queryKeys.folders.list(mailboxId),
			});
		}
	};

	// Thread-aware helpers
	const hasUnread = (email: Email): boolean => {
		if (email.thread_unread_count !== undefined) {
			return email.thread_unread_count > 0;
		}
		return !email.read;
	};

	const handleRowClick = (email: Email) => {
		selectEmail(email.id);
		if (mailboxId && hasUnread(email)) {
			if (email.thread_id && email.thread_count && email.thread_count > 1) {
				markThreadRead.mutate({
					mailboxId,
					threadId: email.thread_id,
				});
			} else {
				updateEmail.mutate({
					mailboxId,
					id: email.id,
					data: { read: true },
				});
			}
		}
	};

	const formatParticipants = (email: Email): string => {
		if (email.participants) {
			const names = email.participants
				.split(",")
				.map((p) => p.trim().split("@")[0])
				.filter((name, idx, arr) => arr.indexOf(name) === idx);
			if (names.length <= 3) return names.join(", ");
			return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
		}
		return email.sender.split("@")[0];
	};

	return (
		<MailboxSplitView
			selectedEmailId={selectedEmailId}
			isComposing={isComposing}
		>
				{/* Folder header */}
				<div className="flex items-center justify-between px-4 py-3.5 border-b border-kumo-line shrink-0 md:px-5">
					<h1 className="text-lg font-semibold text-kumo-default">
						{folderName}
					</h1>
					<div className="flex items-center gap-1">
						{totalCount > 0 && (
							<span className="text-sm text-kumo-subtle mr-2 hidden sm:inline">
								{t(`${totalCount} conversation${totalCount !== 1 ? "s" : ""}`, `${totalCount} 个会话`)}
							</span>
						)}
						<Tooltip
							content={isRefreshing ? t("Refreshing...", "正在刷新…") : t("Refresh", "刷新")}
							side="bottom"
							asChild
						>
							<Button
								variant="ghost"
								shape="square"
								size="sm"
								icon={
									<ArrowsClockwiseIcon
										size={18}
										className={isRefreshing ? "animate-spin" : ""}
									/>
								}
								onClick={handleRefresh}
								disabled={isRefreshing}
								aria-label={t("Refresh", "刷新")}
							/>
						</Tooltip>
					</div>
				</div>

				{/* Email rows */}
				<div className="flex-1 overflow-y-auto">
				{isError ? (
					<div className="p-4 space-y-3">
						<Banner variant="error" text={t("Unable to load emails.", "邮件加载失败。")} />
						<Button size="sm" variant="secondary" onClick={() => void refetch()}>{t("Retry", "重试")}</Button>
					</div>
				) : isRefreshing && emails.length === 0 ? (
					<EmailListSkeleton />
				) : emails.length > 0 ? (
						<div>
							{emails.map((email) => {
								const isSelected = selectedEmailId === email.id;
								const snippet = getSnippetText(email.snippet);
								return (
									<div
										key={email.id}
										role="button"
										tabIndex={0}
										onClick={() => handleRowClick(email)}
										onKeyDown={(e) => {
											if (e.key === "Enter" || e.key === " ") {
												e.preventDefault();
												handleRowClick(email);
											}
										}}
										className={`group flex items-center gap-3 w-full text-left cursor-pointer transition-colors border-b border-kumo-line px-4 py-2.5 md:px-6 md:py-3 ${
											isPanelOpen ? "md:px-4 md:py-2.5" : ""
										} ${isSelected ? "bg-kumo-tint" : "hover:bg-kumo-tint"}`}
									>
										{/* Unread dot */}
										<div className="w-2.5 shrink-0 flex justify-center">
											{hasUnread(email) && (
												<div className="h-2 w-2 rounded-full bg-kumo-brand" />
											)}
										</div>

										{/* Star */}
										<button
											type="button"
											className="shrink-0 p-0.5 bg-transparent border-0 cursor-pointer"
											aria-label={email.starred ? t("Unstar", "取消星标") : t("Star", "添加星标")}
											onClick={(e) => {
												e.stopPropagation();
												toggleStar(e, email);
											}}
										>
											<StarIcon
												size={16}
												weight={email.starred ? "fill" : "regular"}
												className={
													email.starred
														? "text-kumo-warning"
														: "text-kumo-subtle hover:text-kumo-warning"
												}
											/>
										</button>

										{/* Content */}
										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-2">
												<span
													className={`truncate text-sm ${hasUnread(email) ? "font-semibold text-kumo-default" : "text-kumo-strong"}`}
												>
													{formatParticipants(email)}
												</span>
												{(email.thread_count ?? 1) > 1 && (
													<span className="shrink-0 text-xs text-kumo-subtle bg-kumo-fill rounded-full px-1.5 py-0.5 font-medium">
														{email.thread_count}
													</span>
												)}
												{email.has_draft && (
													<span className="shrink-0 text-xs text-kumo-destructive font-medium">
														{t("Draft", "草稿")}
													</span>
												)}
												{email.needs_reply && !email.has_draft && (
													<Tooltip content={t("Needs reply", "待回复")} asChild>
														<span className="shrink-0 text-kumo-warning">
															<ArrowBendUpLeftIcon size={14} weight="bold" />
														</span>
													</Tooltip>
												)}
												<span className="text-sm text-kumo-subtle shrink-0 ml-auto">
													{formatListDate(email.date, dateLocale)}
												</span>
											</div>
											<div className="truncate text-sm mt-0.5">
												<span
													className={hasUnread(email) ? "font-medium text-kumo-default" : "text-kumo-subtle"}
												>
													{email.subject}
												</span>
											{snippet && (
												<span className="text-kumo-subtle font-normal">
													{" "}&mdash; {snippet}
												</span>
											)}
										</div>
									</div>

										{/* Hover actions */}
										<div className="hidden group-hover:flex items-center shrink-0">
											<Tooltip content={email.read ? t("Mark unread", "标为未读") : t("Mark read", "标为已读")} asChild>
												<Button
													variant="ghost"
													shape="square"
													size="sm"
													icon={email.read ? <EnvelopeSimpleIcon size={14} /> : <EnvelopeOpenIcon size={14} />}
													onClick={(e) => {
														e.stopPropagation();
														if (mailboxId)
															updateEmail.mutate({
																mailboxId,
																id: email.id,
																data: { read: !email.read },
															});
													}}
													aria-label={email.read ? t("Mark unread", "标为未读") : t("Mark read", "标为已读")}
												/>
											</Tooltip>
											<Tooltip content={t("Delete", "删除")} asChild>
												<Button
													variant="ghost"
													shape="square"
													size="sm"
													icon={<TrashIcon size={14} />}
													onClick={(e) => handleDelete(e, email.id)}
													aria-label={t("Delete", "删除")}
												/>
											</Tooltip>
										</div>
									</div>
								);
							})}
						</div>
					) : (
						<FolderEmptyState
							folder={folder}
							onCompose={() => startCompose()}
						/>
					)}
				</div>

				{/* Pagination */}
				{totalCount > PAGE_SIZE && (
					<nav aria-label={t("Pagination", "分页")} className="flex flex-wrap items-center justify-center gap-2 py-3 border-t border-kumo-line shrink-0">
						<Button size="sm" variant="ghost" disabled={page <= 1 || isRefreshing} onClick={() => setPage(1)}>{t("First", "首页")}</Button>
						<Button size="sm" variant="ghost" disabled={page <= 1 || isRefreshing} onClick={() => setPage(page - 1)}>{t("Previous", "上一页")}</Button>
						<label className="flex items-center gap-1 text-sm text-kumo-subtle">
							{t("Page", "页码")}
							<input type="number" min={1} max={totalPages} value={editingPage} disabled={isRefreshing}
								onChange={(event) => setEditingPage(event.target.value)}
								onBlur={(event) => {
									const value = event.target.valueAsNumber;
									const next = Number.isFinite(value) ? Math.min(totalPages, Math.max(1, Math.trunc(value))) : page;
									setEditingPage(String(next));
									setPage(next);
								}}
								onKeyDown={(event) => {
									if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
									if (event.key === "Escape") { event.preventDefault(); setEditingPage(String(page)); }
								}}
								className="w-14 rounded border border-kumo-line bg-kumo-base px-1 py-1 text-center text-kumo-default" />
							{t(`of ${totalPages}`, `/ ${totalPages}`)}
						</label>
						<Button size="sm" variant="ghost" disabled={page >= totalPages || isRefreshing} onClick={() => setPage(page + 1)}>{t("Next", "下一页")}</Button>
						<Button size="sm" variant="ghost" disabled={page >= totalPages || isRefreshing} onClick={() => setPage(totalPages)}>{t("Last", "末页")}</Button>
					</nav>
				)}
		</MailboxSplitView>
	);
}
