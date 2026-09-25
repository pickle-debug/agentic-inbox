// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Badge, Button, Dialog, Input, Tooltip, useKumoToastManager } from "@cloudflare/kumo";
import {
	AddressBookIcon,
	ArchiveIcon,
	CaretLeftIcon,
	FileIcon,
	FolderIcon,
	PaperPlaneTiltIcon,
	PencilSimpleIcon,
	PlusIcon,
	SignOutIcon,
	TrashIcon,
	TrayIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router";
import { Folders, SYSTEM_FOLDER_IDS } from "shared/folders";
import { useCreateFolder, useFolders } from "~/queries/folders";
import { useMailbox } from "~/queries/mailboxes";
import { useUIStore } from "~/hooks/useUIStore";
import api from "~/services/api";
import { useI18n } from "~/hooks/useI18n";

const FOLDER_ICONS: Record<string, React.ReactNode> = {
	[Folders.INBOX]: <TrayIcon size={18} weight="regular" />,
	[Folders.SENT]: <PaperPlaneTiltIcon size={18} weight="regular" />,
	[Folders.DRAFT]: <FileIcon size={18} weight="regular" />,
	[Folders.ARCHIVE]: <ArchiveIcon size={18} weight="regular" />,
	[Folders.TRASH]: <TrashIcon size={18} weight="regular" />,
};

const SYSTEM_FOLDER_LINKS = [
	{ id: Folders.INBOX, label: "Inbox" },
	{ id: Folders.SENT, label: "Sent" },
	{ id: Folders.DRAFT, label: "Drafts" },
	{ id: Folders.ARCHIVE, label: "Archive" },
	{ id: Folders.TRASH, label: "Trash" },
];

interface FolderLinkProps {
	to: string;
	icon: React.ReactNode;
	label: string;
	unreadCount?: number;
	onClick?: () => void;
}

function FolderLink({
	to,
	icon,
	label,
	unreadCount,
	onClick,
}: FolderLinkProps) {
	return (
		<NavLink
			to={to}
			onClick={onClick}
			className={({ isActive }) =>
				`flex items-center gap-3 py-2 px-3 rounded-md text-sm transition-colors ${
					isActive
						? "bg-kumo-fill font-semibold text-kumo-default"
						: "text-kumo-strong hover:bg-kumo-tint"
				}`
			}
		>
			<span className="shrink-0">{icon}</span>
			<span className="truncate flex-1">{label}</span>
			{unreadCount != null && unreadCount > 0 && (
				<Badge variant="secondary">{unreadCount}</Badge>
			)}
		</NavLink>
	);
}

export default function Sidebar() {
	const { t, message, folderName } = useI18n();
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const navigate = useNavigate();
	const { data: folders = [] } = useFolders(mailboxId);
	const createFolderMutation = useCreateFolder();
	const { startCompose, closeSidebar } = useUIStore();
	const { data: currentMailbox } = useMailbox(mailboxId);
	const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
	const [newFolderName, setNewFolderName] = useState("");
	const { data: session } = useQuery({ queryKey: ["session"], queryFn: api.getSession });
	const toastManager = useKumoToastManager();
	const [isLoggingOut, setIsLoggingOut] = useState(false);

	const handleLogout = async () => {
		setIsLoggingOut(true);
		try {
			const result = await api.logout();
			window.location.replace(result.redirect);
		} catch (error) {
			toastManager.add({ title: error instanceof Error ? message(error.message) : t("Failed to sign out. Please try again.", "退出登录失败，请重试。"), variant: "error" });
			setIsLoggingOut(false);
		}
	};

	const customFolders = useMemo(
		() =>
			folders.filter((f) => !(SYSTEM_FOLDER_IDS as readonly string[]).includes(f.id)),
		[folders],
	);

	const getUnreadCount = (folderId: string) => {
		const found = folders.find((f) => f.id === folderId);
		return found?.unreadCount || 0;
	};

	const handleCreateFolder = (e: React.FormEvent) => {
		e.preventDefault();
		if (newFolderName.trim() && mailboxId) {
			createFolderMutation.mutate({ mailboxId, name: newFolderName.trim() });
			setNewFolderName("");
			setIsCreateFolderOpen(false);
		}
	};

	const displayName = useMemo(() => {
		if (!currentMailbox) return mailboxId?.split("@")[0] || t("Mailbox", "邮箱");
		// Prefer settings.fromName > name > local part of email
		if (currentMailbox.settings?.fromName) {
			return currentMailbox.settings.fromName;
		}
		if (currentMailbox.name && currentMailbox.name !== currentMailbox.email) {
			return currentMailbox.name;
		}
		return currentMailbox.email.split("@")[0] || currentMailbox.name;
	}, [currentMailbox, mailboxId, t]);

	const handleNavClick = () => {
		// Close mobile sidebar on navigation
		closeSidebar();
	};

	return (
		<aside className="h-full w-64 bg-kumo-recessed flex flex-col shrink-0 border-r border-kumo-line">
			{/* Back + identity */}
			<div className="px-4 pt-4 pb-1">
				{session?.role === "admin" && <button
					type="button"
					onClick={() => {
						navigate("/");
						closeSidebar();
					}}
					className="flex items-center gap-1.5 text-kumo-subtle text-sm hover:text-kumo-default transition-colors mb-2.5 cursor-pointer bg-transparent border-0 p-0"
				>
					<CaretLeftIcon size={14} />
					<span>{t("Mailboxes", "邮箱")}</span>
				</button>}
				{/* Mailbox users skip the picker; keep logout reachable even when the session query fails. */}
				{session?.role !== "admin" && <Button
					variant="ghost"
					size="sm"
					className="mb-2.5"
					icon={<SignOutIcon size={14} />}
					loading={isLoggingOut}
					disabled={isLoggingOut}
					onClick={handleLogout}
				>{t("Sign out", "退出登录")}</Button>}
				<div className="px-1">
					<div className="text-base font-semibold text-kumo-default truncate">
						{displayName}
					</div>
					<div className="text-sm text-kumo-subtle truncate mt-0.5">
						{currentMailbox?.email || mailboxId}
					</div>
				</div>
			</div>

			{/* Compose */}
			<div className="px-3 py-3">
				<Button
					variant="primary"
					icon={<PencilSimpleIcon size={16} />}
					onClick={() => startCompose()}
					className="w-full"
				>
					{t("Compose", "写邮件")}
				</Button>
			</div>

			{/* Navigation */}
			<nav className="flex-1 overflow-y-auto px-2 space-y-0.5">
				{session?.role === "admin" && <FolderLink to="/contacts" icon={<AddressBookIcon size={18} />} label={t("Contacts", "联系人")} onClick={handleNavClick} />}
				{SYSTEM_FOLDER_LINKS.map((folder) => (
					<FolderLink
						key={folder.id}
						to={`/mailbox/${mailboxId}/emails/${folder.id}`}
						icon={FOLDER_ICONS[folder.id]}
						label={folderName(folder.id, folder.label)}
						unreadCount={getUnreadCount(folder.id)}
						onClick={handleNavClick}
					/>
				))}

				{/* Custom folders */}
				{customFolders.length > 0 && (
					<div className="pt-5">
						<div className="flex items-center justify-between px-3 mb-1.5">
							<span className="text-xs uppercase tracking-wider font-semibold text-kumo-subtle">
								{t("Folders", "文件夹")}
							</span>
							<Tooltip content={t("New folder", "新建文件夹")} asChild>
								<Button
									variant="ghost"
									shape="square"
									size="sm"
									icon={<PlusIcon size={16} />}
									onClick={() => setIsCreateFolderOpen(true)}
									aria-label={t("Create new folder", "新建文件夹")}
								/>
							</Tooltip>
						</div>
						{customFolders.map((folder) => (
							<FolderLink
								key={folder.id}
								to={`/mailbox/${mailboxId}/emails/${folder.id}`}
								icon={<FolderIcon size={18} />}
								label={folderName(folder.id, folder.name)}
								unreadCount={folder.unreadCount}
								onClick={handleNavClick}
							/>
						))}
					</div>
				)}

				{/* Add folder button when no custom folders */}
				{customFolders.length === 0 && (
					<div className="pt-5">
						<div className="flex items-center justify-between px-3 mb-1.5">
							<span className="text-xs uppercase tracking-wider font-semibold text-kumo-subtle">
									{t("Folders", "文件夹")}
							</span>
							<Tooltip content={t("New folder", "新建文件夹")} asChild>
								<Button
									variant="ghost"
									shape="square"
									size="sm"
									icon={<PlusIcon size={16} />}
									onClick={() => setIsCreateFolderOpen(true)}
									aria-label={t("Create new folder", "新建文件夹")}
								/>
							</Tooltip>
						</div>
					</div>
				)}
			</nav>

			{/* Create folder dialog */}
			<Dialog.Root
				open={isCreateFolderOpen}
				onOpenChange={setIsCreateFolderOpen}
			>
				<Dialog size="sm" className="p-6">
					<Dialog.Title className="text-base font-semibold mb-4">
						{t("Create folder", "新建文件夹")}
					</Dialog.Title>
					<form onSubmit={handleCreateFolder} className="space-y-4">
						<Input
							label={t("Folder name", "文件夹名称")}
							placeholder={t("e.g. Projects", "例如：项目")}
							value={newFolderName}
							onChange={(e) => setNewFolderName(e.target.value)}
							required
						/>
						<div className="flex justify-end gap-2">
							<Dialog.Close
								render={(props) => (
									<Button {...props} variant="secondary">
										{t("Cancel", "取消")}
									</Button>
								)}
							/>
							<Button
								type="submit"
								variant="primary"
								disabled={!newFolderName.trim()}
							>
								{t("Create", "创建")}
							</Button>
						</div>
					</form>
				</Dialog>
			</Dialog.Root>
		</aside>
	);
}
