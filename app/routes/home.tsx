// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import {
	Button,
	Dialog,
	Empty,
	Input,
	Loader,
	Select,
	Text,
	useKumoToastManager,
} from "@cloudflare/kumo";
import { EnvelopeIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Navigate, Link as RouterLink } from "react-router";
import { MailboxPasswordDialog } from "~/components/MailboxPasswordDialog";
import api from "~/services/api";
import {
	useCreateMailbox,
	useDeleteMailbox,
	useMailboxes,
} from "~/queries/mailboxes";
import { queryKeys } from "~/queries/keys";
import { useI18n } from "~/hooks/useI18n";
import LanguageSelector from "~/components/LanguageSelector";

export function meta() {
	return [{ title: "Agentic Inbox" }];
}

export default function HomeRoute() {
	const { t, message } = useI18n();
	const toastManager = useKumoToastManager();
	const { data: mailboxes = [], refetch: refetchMailboxes, isFetched: mailboxesFetched } = useMailboxes();
	const createMailbox = useCreateMailbox();
	const deleteMailbox = useDeleteMailbox();
	const { data: session, error: sessionError, refetch: refetchSession } = useQuery({
		queryKey: ["session"],
		queryFn: () => api.getSession(),
	});

	const { data: configData } = useQuery({
		queryKey: queryKeys.config,
		queryFn: () => api.getConfig(),
		staleTime: Infinity, // config rarely changes
	});

	const domains = configData?.domains ?? [];
	const emailAddresses = configData?.emailAddresses ?? [];

	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const [newPrefix, setNewPrefix] = useState("");
	const [selectedDomain, setSelectedDomain] = useState("");
	const [newName, setNewName] = useState("");
	const [isCreating, setIsCreating] = useState(false);
	const [createError, setCreateError] = useState<string | null>(null);
	const [isDeleteOpen, setIsDeleteOpen] = useState(false);
	const [mailboxToDelete, setMailboxToDelete] = useState<{
		id: string;
		email: string;
	} | null>(null);
	const [isDeleting, setIsDeleting] = useState(false);
	const [mailboxForPassword, setMailboxForPassword] = useState<{
		id: string;
		email: string;
	} | null>(null);
	const isAdmin = session?.role === "admin";

	// Set default domain when config loads
	useEffect(() => {
		if (domains.length > 0 && !selectedDomain) {
			setSelectedDomain(domains[0]);
		}
	}, [domains, selectedDomain]);

	// Auto-create mailboxes from config (run once when both data sources are ready)
	const autoCreateDone = useRef(false);
	useEffect(() => {
		if (autoCreateDone.current) return;
		if (!isAdmin || emailAddresses.length === 0 || !mailboxesFetched) return;
		const existingEmails = new Set(
			mailboxes.map((m) => m.email.toLowerCase()),
		);
		const toCreate = emailAddresses.filter(
			(addr) => !existingEmails.has(addr.toLowerCase()),
		);
		if (toCreate.length === 0) {
			autoCreateDone.current = true;
			return;
		}
		autoCreateDone.current = true;
		let cancelled = false;
		Promise.all(
			toCreate.map((addr) => {
				const localPart = addr.split("@")[0] || addr;
				return api.createMailbox(addr, localPart).catch(() => {});
			}),
		).then(() => { if (!cancelled) refetchMailboxes(); });
		return () => { cancelled = true; };
	}, [emailAddresses, isAdmin, mailboxes, refetchMailboxes]);

	const handleCreate = async (e: FormEvent) => {
		e.preventDefault();
		setCreateError(null);
		if (!newPrefix || !selectedDomain) {
			setCreateError(t("Please fill in all fields", "请填写所有必填项"));
			return;
		}
		const email = `${newPrefix}@${selectedDomain}`;
		const name = newName || newPrefix;
		setIsCreating(true);
		try {
			await createMailbox.mutateAsync({ email, name });
			toastManager.add({ title: t("Mailbox created successfully!", "邮箱创建成功！") });
			setIsCreateOpen(false);
			setNewPrefix("");
			setNewName("");
		} catch (err: unknown) {
			setCreateError((err instanceof Error ? err.message : null) || t("Failed to create mailbox", "创建邮箱失败"));
		} finally {
			setIsCreating(false);
		}
	};

	const handleDelete = async () => {
		if (!mailboxToDelete) return;
		setIsDeleting(true);
		try {
			await deleteMailbox.mutateAsync(mailboxToDelete.id);
			toastManager.add({ title: t("Mailbox deleted", "邮箱已删除") });
			setIsDeleteOpen(false);
			setMailboxToDelete(null);
		} catch {
			toastManager.add({ title: t("Failed to delete mailbox", "删除邮箱失败"), variant: "error" });
		} finally {
			setIsDeleting(false);
		}
	};

	const isConfigured = isAdmin && emailAddresses.length > 0;
	const accounts = isConfigured
		? emailAddresses.map((addr) => ({
				id: addr,
				email: addr,
				name: addr.split("@")[0] || addr,
			}))
		: mailboxes;

	const isLoading = !configData;

	// Also cover bookmarks and client-side returns to the mailbox picker without adding a history entry.
	if (session?.role === "mailbox") {
		return <Navigate to={`/mailbox/${encodeURIComponent(session.email)}/emails/inbox`} replace />;
	}
	if (sessionError) {
		return <div className="min-h-screen flex flex-col items-center justify-center gap-4">
			<Text variant="error">{t("Unable to load login status. Please try again.", "无法读取登录状态，请重试。")}</Text>
			<Button onClick={() => refetchSession()}>{t("Retry", "重试")}</Button>
		</div>;
	}
	if (!session) {
		return <div className="min-h-screen flex items-center justify-center"><Loader size="lg" /></div>;
	}

	return (
		<div className="min-h-screen bg-kumo-recessed">
			<div className="mx-auto max-w-2xl px-4 py-8 md:px-6 md:py-16">
				<div className="mb-8">
					<div className="flex flex-wrap items-center justify-between gap-4">
						<div>
							<h1 className="text-2xl font-bold text-kumo-default">{t("Mailboxes", "邮箱")}</h1>
							{session && <p className="mt-1 break-all text-sm text-kumo-subtle">{session.email} · {isAdmin ? t("Administrator", "管理员") : t("Mailbox account", "邮箱账号")}</p>}
						</div>
						<div className="flex flex-wrap items-center justify-end gap-2">
						<LanguageSelector compact />
						{isAdmin && !isConfigured && (
							<Button
								variant="primary"
								size="base"
								className="w-32 justify-center text-sm"
								icon={<PlusIcon size={16} />}
								onClick={() => setIsCreateOpen(true)}
							>
								{t("New mailbox", "新建邮箱")}
							</Button>
						)}
						{session && <Button variant="secondary" size="base" className="w-32 justify-center text-sm" onClick={async () => { const result = await api.logout(); window.location.href = result.redirect; }}>{t("Sign out", "退出登录")}</Button>}
						</div>
					</div>
					{domains.length > 0 && (
						<p className="text-sm text-kumo-subtle mt-1">
							{domains.join(", ")}
						</p>
					)}
				</div>

				{isLoading ? (
					<div className="flex justify-center py-20">
						<Loader size="lg" />
					</div>
				) : accounts.length > 0 ? (
					<div className="rounded-xl border border-kumo-line bg-kumo-base overflow-hidden">
						{accounts.map((account, idx) => (
							<RouterLink
								key={account.id}
								to={`/mailbox/${account.id}`}
								className={`group flex items-center gap-4 px-5 py-4 no-underline transition-colors hover:bg-kumo-tint ${
									idx > 0 ? "border-t border-kumo-line" : ""
								}`}
							>
								<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-kumo-fill text-sm font-bold text-kumo-default">
									{account.name.charAt(0).toUpperCase()}
								</div>
								<div className="min-w-0 flex-1">
									<div className="text-sm font-medium text-kumo-default truncate">
										{account.name}
									</div>
									<div className="text-sm text-kumo-subtle">
										{account.email}
									</div>
								</div>
								{isAdmin && !isConfigured && (
									<Button
										variant="ghost"
										size="sm"
										shape="square"
										icon={<TrashIcon size={16} />}
										aria-label={t(`Delete mailbox ${account.email}`, `删除邮箱 ${account.email}`)}
										onClick={(e) => {
											e.preventDefault();
											e.stopPropagation();
											setMailboxToDelete({
												id: account.id,
												email: account.email,
											});
											setIsDeleteOpen(true);
										}}
									/>
								)}
								{isAdmin && (
									<Button
										variant="ghost"
										size="sm"
										onClick={(event) => {
											event.preventDefault();
											event.stopPropagation();
											setMailboxForPassword({ id: account.id, email: account.email });
										}}
									>
										{t("Password login", "密码登录")}
									</Button>
								)}
							</RouterLink>
						))}
					</div>
				) : (
					<div className="rounded-xl border border-kumo-line bg-kumo-base py-16 px-6">
						<div className="flex flex-col items-center text-center">
							<div className="mb-4">
								<EnvelopeIcon
									size={48}
									weight="thin"
									className="text-kumo-subtle"
								/>
							</div>
							<h3 className="text-base font-semibold text-kumo-default mb-1.5">
								{t("No mailboxes yet", "暂无邮箱")}
							</h3>
							<p className="text-sm text-kumo-subtle max-w-sm mb-5">
								{isConfigured
									? t("Your email routing is configured but no mailboxes have been created yet. They will appear here automatically.", "邮件路由已配置，尚未创建的邮箱将自动显示在此处。")
									: t("Create a mailbox to start sending and receiving emails with your domain.", "创建邮箱，即可使用你的域名收发邮件。")}
							</p>
							{isAdmin && !isConfigured && (
								<Button
									variant="primary"
									icon={<PlusIcon size={16} />}
									onClick={() => setIsCreateOpen(true)}
								>
									{t("Create Mailbox", "创建邮箱")}
								</Button>
							)}
						</div>
					</div>
				)}
			</div>

			{/* Create Dialog */}
			<Dialog.Root open={isCreateOpen} onOpenChange={setIsCreateOpen}>
				<Dialog size="sm" className="p-6">
					<Dialog.Title className="text-base font-semibold mb-5">
						{t("Create New Mailbox", "创建新邮箱")}
					</Dialog.Title>
					<form onSubmit={handleCreate} className="space-y-4">
						{createError && (
							<Text variant="error" size="sm">
								{message(createError)}
							</Text>
						)}
						<div>
							<span className="text-sm font-medium text-kumo-default mb-1.5 block">
								{t("Email Address", "邮箱地址")}
							</span>
							<div className="flex items-center gap-2">
								<div className="flex-1">
									<Input
										aria-label={t("Address prefix", "邮箱前缀")}
										placeholder="info"
										size="sm"
										value={newPrefix}
										onChange={(e) => setNewPrefix(e.target.value)}
										required
									/>
								</div>
								<span className="text-sm text-kumo-subtle">@</span>
								{domains.length > 1 ? (
									<div className="flex-1">
							<Select
								aria-label={t("Domain", "域名")}
								value={selectedDomain}
								onValueChange={(value) => {
									if (value) setSelectedDomain(value);
								}}
							>
											{domains.map((d) => (
												<Select.Option key={d} value={d}>
													{d}
												</Select.Option>
											))}
										</Select>
									</div>
								) : (
									<span className="text-sm text-kumo-subtle">
										{selectedDomain || t("no domain", "暂无域名")}
									</span>
								)}
							</div>
						</div>
						<Input
							label={t("Display Name (optional)", "显示名称（选填）")}
							placeholder={t("Info", "信息咨询")}
							size="sm"
							value={newName}
							onChange={(e) => setNewName(e.target.value)}
						/>
						<div className="flex justify-end gap-2 pt-2">
							<Dialog.Close
								render={(props) => (
									<Button {...props} variant="secondary" size="sm">
										{t("Cancel", "取消")}
									</Button>
								)}
							/>
							<Button
								type="submit"
								variant="primary"
								size="sm"
								loading={isCreating}
								disabled={!selectedDomain}
							>
								{t("Create", "创建")}
							</Button>
						</div>
					</form>
				</Dialog>
			</Dialog.Root>

			{/* Delete Dialog */}
			<Dialog.Root
				open={isDeleteOpen}
				onOpenChange={(open) => {
					setIsDeleteOpen(open);
					if (!open) setMailboxToDelete(null);
				}}
			>
				<Dialog size="sm" className="p-6">
					<Dialog.Title className="text-base font-semibold mb-2">
						{t("Delete Mailbox", "删除邮箱")}
					</Dialog.Title>
					<Dialog.Description className="text-kumo-subtle text-sm mb-5">
						{t("Are you sure you want to delete ", "确认删除 ")}
						<strong className="text-kumo-default">
							{mailboxToDelete?.email}
						</strong>
						{t("? This action cannot be undone.", "？此操作无法撤销。")}
					</Dialog.Description>
					<div className="flex justify-end gap-2">
						<Dialog.Close
							render={(props) => (
								<Button {...props} variant="secondary" size="sm">
									{t("Cancel", "取消")}
								</Button>
							)}
						/>
						<Button
							variant="destructive"
							size="sm"
							loading={isDeleting}
							onClick={handleDelete}
						>
							{t("Delete", "删除")}
						</Button>
					</div>
				</Dialog>
			</Dialog.Root>

			{mailboxForPassword && (
				<MailboxPasswordDialog
					mailboxId={mailboxForPassword.id}
					email={mailboxForPassword.email}
					open={true}
					onOpenChange={(open) => { if (!open) setMailboxForPassword(null); }}
				/>
			)}
		</div>
	);
}
