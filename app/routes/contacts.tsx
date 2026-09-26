// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Dialog, Input, Loader, Tooltip, useKumoToastManager } from "@cloudflare/kumo";
import { AddressBookIcon, ArrowsClockwiseIcon, PlusIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router";
import { contactInputSchema, type Contact, type ContactInput } from "shared/contacts";
import { useContacts, useCreateContact, useDeleteContact, useUpdateContact } from "~/queries/contacts";
import api from "~/services/api";
import { useI18n } from "~/hooks/useI18n";

const PAGE_SIZE = 30;
const EMPTY_CONTACT: ContactInput = { name: "", email: "", notes: "", introduction: "" };

export function meta() {
	return [{ title: "Agentic Inbox" }];
}

export default function ContactsRoute() {
	const { t, message } = useI18n();
	useEffect(() => { document.title = `${t("Contacts", "系统联系人")} · Agentic Inbox`; }, [t]);
	const [searchParams, setSearchParams] = useSearchParams();
	const toast = useKumoToastManager();
	const session = useQuery({ queryKey: ["session"], queryFn: api.getSession });
	const isAdmin = session.data?.role === "admin";
	const query = (searchParams.get("q") || "").trim();
	const [pagination, setPagination] = useState({ query, page: 1 });
	// Start a changed search on page one before the query runs.
	const page = pagination.query === query ? pagination.page : 1;
	const setPage = (nextPage: number) => setPagination({ query, page: nextPage });
	const contacts = useContacts(query, page, PAGE_SIZE, isAdmin);
	const createContact = useCreateContact();
	const updateContact = useUpdateContact();
	const deleteContact = useDeleteContact();
	const [detail, setDetail] = useState<Contact | null>(null);
	const [editorOpen, setEditorOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [draft, setDraft] = useState<ContactInput>(EMPTY_CONTACT);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [deleting, setDeleting] = useState<Contact | null>(null);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const saving = createContact.isPending || updateContact.isPending;
	const total = contacts.data?.totalCount ?? 0;
	const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

	useEffect(() => {
		setPagination({ query, page: 1 });
	}, [query]);

	useEffect(() => {
		// Deleting the last result on a page must not strand the user on an empty page.
		if (contacts.data && !contacts.isFetching && page > pages) setPage(pages);
	}, [contacts.data, contacts.isFetching, page, pages, query]);

	const clearSearch = () => {
		const next = new URLSearchParams(searchParams);
		next.delete("q");
		setSearchParams(next);
	};

	const openEditor = (contact?: Contact) => {
		setEditingId(contact?.id ?? null);
		setDraft(contact ? { name: contact.name, email: contact.email, notes: contact.notes, introduction: contact.introduction } : EMPTY_CONTACT);
		setSaveError(null);
		setDetail(null);
		setEditorOpen(true);
	};

	const handleSave = async (event: FormEvent) => {
		event.preventDefault();
		if (!isAdmin || saving) return;
		const parsed = contactInputSchema.safeParse(draft);
		if (!parsed.success) {
			setSaveError(parsed.error.issues[0].message);
			return;
		}
		setSaveError(null);
		try {
			if (editingId) await updateContact.mutateAsync({ id: editingId, ...parsed.data });
			else await createContact.mutateAsync(parsed.data);
			setEditorOpen(false);
			toast.add({ title: editingId ? t("Contact updated", "联系人已更新") : t("Contact created", "联系人已创建") });
		} catch (error) {
			setSaveError(error instanceof Error ? error.message : t("Failed to save. Please try again.", "保存失败，请重试。"));
		}
	};

	const handleDelete = async () => {
		if (!isAdmin || !deleting || deleteContact.isPending) return;
		setDeleteError(null);
		try {
			await deleteContact.mutateAsync(deleting.id);
			setDeleting(null);
			toast.add({ title: t("Contact deleted", "联系人已删除") });
		} catch (error) {
			setDeleteError(error instanceof Error ? error.message : t("Failed to delete. Please try again.", "删除失败，请重试。"));
		}
	};

	if (session.isError) {
		return <div className="h-full min-h-0 flex flex-col items-center justify-center gap-4 bg-kumo-base p-6">
			<p role="alert" className="text-kumo-danger">{t("Unable to load login status. Please try again.", "无法读取登录状态，请重试。")}</p>
			<Button size="sm" onClick={() => session.refetch()} loading={session.isFetching} disabled={session.isFetching}>{t("Retry", "重试")}</Button>
		</div>;
	}
	if (!session.data) {
		return <div className="h-full min-h-0 flex items-center justify-center bg-kumo-base" role="status" aria-label={t("Loading login status", "加载登录状态")}><Loader size="lg" /></div>;
	}
	// A bookmarked directory URL must not expose administrator contacts to a mailbox user.
	if (!isAdmin) return <Navigate to="/" replace />;

	return (
		<div className="h-full min-h-0 flex flex-col bg-kumo-base text-kumo-default">
				<header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3.5 border-b border-kumo-line shrink-0 md:px-5">
					<h1 className="text-lg font-semibold">{t("System contacts", "系统联系人")}</h1>
					<div className="flex items-center gap-1">
						{contacts.data && !contacts.isError && <span className="mr-2 hidden text-sm text-kumo-subtle sm:inline" aria-live="polite">{t(`${total} contacts`, `${total} 位联系人`)}</span>}
						<Tooltip content={contacts.isFetching ? t("Refreshing...", "正在刷新…") : t("Refresh", "刷新")} side="bottom" asChild>
							<Button variant="ghost" shape="square" size="sm" icon={<ArrowsClockwiseIcon size={18} aria-hidden="true" className={contacts.isFetching ? "animate-spin" : ""} />} onClick={() => void contacts.refetch()} disabled={contacts.isFetching} aria-label={t("Refresh", "刷新")} />
						</Tooltip>
						<Button variant="primary" size="sm" icon={<PlusIcon size={16} />} onClick={() => openEditor()}>{t("New contact", "新建联系人")}</Button>
					</div>
				</header>
				<section aria-label={t("Contact list", "联系人列表")} aria-busy={contacts.isFetching} className="min-h-0 flex-1 overflow-y-auto">
					{contacts.isError ? <div className="p-4 space-y-3">
						<p role="alert" className="text-sm text-kumo-danger">{contacts.error instanceof Error ? message(contacts.error.message) : t("Failed to load contacts. Please try again.", "联系人加载失败，请重试。")}</p>
						<Button size="sm" variant="secondary" onClick={() => contacts.refetch()} loading={contacts.isFetching} disabled={contacts.isFetching}>{t("Retry", "重试")}</Button>
					</div> : contacts.isPending ? <div className="flex justify-center py-16" role="status" aria-label={t("Loading contacts", "加载联系人")}><Loader /></div> : !contacts.data?.contacts.length ? <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
						<AddressBookIcon size={48} weight="thin" aria-hidden="true" className="mb-4 text-kumo-subtle" />
						<h2 className="mb-1.5 text-base font-semibold">{query ? t("No matching contacts", "没有找到匹配的联系人") : t("No contacts yet", "暂无联系人")}</h2>
						<p className="mb-5 max-w-xs text-sm text-kumo-subtle">{query ? t("Try other keywords or clear your search.", "试试其他关键词，或清空搜索。") : t("Create contacts so administrators can find them when composing in any mailbox.", "创建联系人后，管理员可在任意子邮箱写信时搜索使用。")}</p>
						{query ? <Button variant="primary" size="sm" onClick={clearSearch}>{t("Clear search", "清空搜索")}</Button> : <Button variant="primary" size="sm" icon={<PlusIcon size={16} />} onClick={() => openEditor()}>{t("New contact", "新建联系人")}</Button>}
					</div> : <ul>
						{contacts.data.contacts.map(contact => <li key={contact.id}>
							<button type="button" onClick={() => setDetail(contact)} className="w-full cursor-pointer border-b border-kumo-line px-4 py-2.5 text-left transition-colors hover:bg-kumo-tint focus-visible:outline-2 focus-visible:outline-kumo-ring focus-visible:-outline-offset-2 md:px-6 md:py-3">
								<div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
									<span className="text-sm font-medium break-words sm:w-48 sm:shrink-0">{contact.name}</span>
									<span className="min-w-0 break-all text-sm text-kumo-subtle">{contact.email}</span>
								</div>
								{(contact.notes || contact.introduction) && <p className="mt-2 line-clamp-2 break-words text-sm text-kumo-subtle">{contact.notes || contact.introduction}</p>}
							</button>
						</li>)}
					</ul>}
				</section>
				{contacts.data && !contacts.isError && total > PAGE_SIZE && <nav aria-label={t("Pagination", "分页")} className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-kumo-line py-3">
					<Button variant="ghost" size="sm" disabled={page <= 1 || contacts.isFetching} onClick={() => setPage(1)}>{t("First", "首页")}</Button>
					<Button variant="ghost" size="sm" disabled={page <= 1 || contacts.isFetching} onClick={() => setPage(page - 1)}>{t("Previous", "上一页")}</Button>
					<span className="text-sm text-kumo-subtle" aria-live="polite">{t(`Page ${page} of ${pages}`, `第 ${page} / ${pages} 页`)}</span>
					<Button variant="ghost" size="sm" disabled={page >= pages || contacts.isFetching} onClick={() => setPage(page + 1)}>{t("Next", "下一页")}</Button>
					<Button variant="ghost" size="sm" disabled={page >= pages || contacts.isFetching} onClick={() => setPage(pages)}>{t("Last", "末页")}</Button>
				</nav>}

			<Dialog.Root open={!!detail} onOpenChange={open => { if (!open) setDetail(null); }}>
				<Dialog size="sm" className="max-h-[90dvh] overflow-y-auto p-6">
					<Dialog.Title className="break-words text-lg font-semibold">{detail?.name}</Dialog.Title>
					<Dialog.Description className="mt-1 break-all text-sm text-kumo-subtle">{detail?.email}</Dialog.Description>
					<dl className="my-6 space-y-5 text-sm">
						<div><dt className="font-medium">{t("Notes", "备注")}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-kumo-subtle">{detail?.notes || t("No notes", "暂无备注")}</dd></div>
						<div><dt className="font-medium">{t("Introduction", "介绍")}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-kumo-subtle">{detail?.introduction || t("No introduction", "暂无介绍")}</dd></div>
					</dl>
					<div className="flex flex-wrap justify-end gap-2">
						{isAdmin && detail && <>
							<Button variant="destructive" onClick={() => { setDeleting(detail); setDeleteError(null); setDetail(null); }}>{t("Delete", "删除")}</Button>
							<Button variant="primary" onClick={() => openEditor(detail)}>{t("Edit", "编辑")}</Button>
						</>}
						<Button variant="secondary" onClick={() => setDetail(null)}>{t("Close", "关闭")}</Button>
					</div>
				</Dialog>
			</Dialog.Root>

			<Dialog.Root open={editorOpen && isAdmin} onOpenChange={open => { if (!saving) setEditorOpen(open); }}>
				<Dialog size="sm" className="max-h-[90dvh] overflow-y-auto p-6">
					<Dialog.Title className="text-lg font-semibold">{editingId ? t("Edit contact", "编辑联系人") : t("New contact", "新建联系人")}</Dialog.Title>
					<Dialog.Description className="mt-2 mb-5 text-sm text-kumo-subtle">{t("Names, emails, notes and introductions are visible only to administrators.", "姓名、邮箱、备注和介绍仅管理员可见。")}</Dialog.Description>
					<form onSubmit={handleSave} className="space-y-4">
						{saveError && <p role="alert" className="text-sm text-kumo-danger">{message(saveError)}</p>}
						<fieldset disabled={saving} className="space-y-4">
							<Input label={t("Name", "姓名")} value={draft.name} required maxLength={120} onChange={event => setDraft({ ...draft, name: event.target.value })} />
							<Input label={t("Email", "邮箱")} type="email" value={draft.email} required maxLength={254} onChange={event => setDraft({ ...draft, email: event.target.value })} />
							<div>
								<label htmlFor="contact-notes" className="mb-1.5 block text-sm font-medium">{t("Notes (optional)", "备注（选填）")}</label>
								<textarea id="contact-notes" rows={3} maxLength={1000} value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} className="w-full resize-y rounded-md border border-kumo-line bg-kumo-base p-3 text-sm focus-visible:outline-2 focus-visible:outline-kumo-ring" />
							</div>
							<div>
								<label htmlFor="contact-introduction" className="mb-1.5 block text-sm font-medium">{t("Introduction (optional)", "介绍（选填）")}</label>
								<textarea id="contact-introduction" rows={5} maxLength={4000} value={draft.introduction} onChange={event => setDraft({ ...draft, introduction: event.target.value })} className="w-full resize-y rounded-md border border-kumo-line bg-kumo-base p-3 text-sm focus-visible:outline-2 focus-visible:outline-kumo-ring" />
							</div>
						</fieldset>
						<div className="flex justify-end gap-2">
							<Button variant="secondary" disabled={saving} onClick={() => setEditorOpen(false)}>{t("Cancel", "取消")}</Button>
							<Button variant="primary" type="submit" loading={saving} disabled={saving || !draft.name.trim() || !draft.email.trim()}>{t("Save", "保存")}</Button>
						</div>
					</form>
				</Dialog>
			</Dialog.Root>

			<Dialog.Root open={!!deleting && isAdmin} onOpenChange={open => { if (!open && !deleteContact.isPending) setDeleting(null); }}>
				<Dialog size="sm" className="p-6">
					<Dialog.Title className="text-lg font-semibold">{t("Delete contact", "删除联系人")}</Dialog.Title>
					<Dialog.Description className="mt-3 mb-5 break-words text-sm text-kumo-subtle">{t(`Delete “${deleting?.name}” (${deleting?.email})? This permanently removes the contact from the system directory. Sent emails are unaffected.`, `确认删除“${deleting?.name}”（${deleting?.email}）？此操作将从全系统通讯录移除该联系人，无法撤销。已发送的邮件不受影响。`)}</Dialog.Description>
					{deleteError && <p role="alert" className="mb-4 text-sm text-kumo-danger">{message(deleteError)}</p>}
					<div className="flex justify-end gap-2">
						<Button variant="secondary" disabled={deleteContact.isPending} onClick={() => setDeleting(null)}>{t("Cancel", "取消")}</Button>
						<Button variant="destructive" loading={deleteContact.isPending} disabled={deleteContact.isPending} onClick={handleDelete}>{t("Confirm delete", "确认删除")}</Button>
					</div>
				</Dialog>
			</Dialog.Root>
		</div>
	);
}
