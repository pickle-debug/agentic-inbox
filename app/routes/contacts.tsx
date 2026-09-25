// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Dialog, Input, Loader, useKumoToastManager } from "@cloudflare/kumo";
import { ArrowLeftIcon, PlusIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { contactInputSchema, type Contact, type ContactInput } from "shared/contacts";
import { useContacts, useCreateContact, useDeleteContact, useUpdateContact } from "~/queries/contacts";
import api from "~/services/api";

const PAGE_SIZE = 30;
const EMPTY_CONTACT: ContactInput = { name: "", email: "", notes: "", introduction: "" };

export function meta() {
	return [{ title: "Agentic Inbox" }];
}

export default function ContactsRoute() {
	useEffect(() => { document.title = `${"Contacts"} · Agentic Inbox`; }, []);
	const navigate = useNavigate();
	const toast = useKumoToastManager();
	const session = useQuery({ queryKey: ["session"], queryFn: api.getSession });
	const isAdmin = session.data?.role === "admin";
	const [search, setSearch] = useState("");
	const [query, setQuery] = useState("");
	const [page, setPage] = useState(1);
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
		const timer = setTimeout(() => {
			setQuery(search.trim());
			setPage(1);
		}, 250);
		return () => clearTimeout(timer);
	}, [search]);

	useEffect(() => {
		// Deleting the last result on a page must not strand the user on an empty page.
		if (contacts.data && !contacts.isFetching && page > pages) setPage(pages);
	}, [contacts.data, contacts.isFetching, page, pages]);

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
			toast.add({ title: editingId ? "Contact updated" : "Contact created" });
		} catch (error) {
			setSaveError(error instanceof Error ? error.message : "Failed to save. Please try again.");
		}
	};

	const handleDelete = async () => {
		if (!isAdmin || !deleting || deleteContact.isPending) return;
		setDeleteError(null);
		try {
			await deleteContact.mutateAsync(deleting.id);
			setDeleting(null);
			toast.add({ title: "Contact deleted" });
		} catch (error) {
			setDeleteError(error instanceof Error ? error.message : "Failed to delete. Please try again.");
		}
	};

	if (session.isError) {
		return <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
			<p role="alert" className="text-kumo-danger">Unable to load login status. Please try again.</p>
			<Button onClick={() => session.refetch()}>Retry</Button>
			<Button variant="secondary" onClick={() => navigate("/")}>Back to mailboxes</Button>
		</main>;
	}
	if (!session.data) {
		return <main className="min-h-screen flex items-center justify-center" aria-label="Loading login status"><Loader size="lg" /></main>;
	}
	// A bookmarked directory URL must not expose administrator contacts to a mailbox user.
	if (!isAdmin) return <Navigate to="/" replace />;

	return (
		<main className="min-h-screen bg-kumo-recessed text-kumo-default">
			<div className="mx-auto max-w-4xl px-4 py-6 md:px-6 md:py-10">
				<div className="flex flex-wrap items-center justify-between gap-3"><Button variant="ghost" size="sm" icon={<ArrowLeftIcon size={16} />} onClick={() => navigate("/")}>Back to mailboxes</Button></div>
				<header className="mt-6 mb-6 flex flex-wrap items-start justify-between gap-4">
					<div className="min-w-0 flex-1">
						<h1 className="text-2xl font-semibold">System contacts</h1>
						<p className="mt-2 text-sm text-kumo-subtle">Visible only to administrators. Search and use these contacts in any mailbox.</p>
					</div>
					{isAdmin && <Button variant="primary" icon={<PlusIcon size={16} />} onClick={() => openEditor()}>New contact</Button>}
				</header>
				<Input label="Search contacts" type="search" placeholder="Search name, email, notes or introduction" maxLength={200} value={search} onChange={event => setSearch(event.target.value)} />
				<section aria-label="Contact list" aria-busy={contacts.isFetching} className="mt-5 border-y border-kumo-line bg-kumo-base">
					{contacts.isError ? <div className="py-12 px-4 text-center space-y-4">
						<p role="alert" className="text-sm text-kumo-danger">{contacts.error instanceof Error ? contacts.error.message : "Failed to load contacts. Please try again."}</p>
						<Button onClick={() => contacts.refetch()}>Retry</Button>
					</div> : contacts.isPending ? <div className="flex justify-center py-16" aria-label="Loading contacts"><Loader /></div> : !contacts.data?.contacts.length ? <div className="py-14 px-4 text-center">
						<p className="font-medium">{query ? "No matching contacts" : "No contacts yet"}</p>
						<p className="mt-2 text-sm text-kumo-subtle">{query ? "Try other keywords or clear your search." : "Create contacts so administrators can find them when composing in any mailbox."}</p>
						{query && <Button variant="secondary" className="mt-4" onClick={() => setSearch("")}>Clear search</Button>}
					</div> : <ul className="divide-y divide-kumo-line">
						{contacts.data.contacts.map(contact => <li key={contact.id}>
							<button type="button" onClick={() => setDetail(contact)} className="w-full cursor-pointer px-4 py-4 text-left transition-colors hover:bg-kumo-tint focus-visible:outline-2 focus-visible:outline-kumo-ring focus-visible:-outline-offset-2">
								<div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
									<span className="font-medium break-words sm:w-48 sm:shrink-0">{contact.name}</span>
									<span className="min-w-0 break-all text-sm text-kumo-subtle">{contact.email}</span>
								</div>
								{(contact.notes || contact.introduction) && <p className="mt-2 line-clamp-2 break-words text-sm text-kumo-subtle">{contact.notes || contact.introduction}</p>}
							</button>
						</li>)}
					</ul>}
				</section>
				{contacts.data && !contacts.isError && <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
					<p className="text-sm text-kumo-subtle" aria-live="polite">{`${total} contacts · Page ${page} / ${pages}`}</p>
					<div className="flex gap-2">
						<Button variant="secondary" size="sm" disabled={page <= 1 || contacts.isFetching} onClick={() => setPage(value => value - 1)}>Previous</Button>
						<Button variant="secondary" size="sm" disabled={page >= pages || contacts.isFetching} onClick={() => setPage(value => value + 1)}>Next</Button>
					</div>
				</div>}
			</div>

			<Dialog.Root open={!!detail} onOpenChange={open => { if (!open) setDetail(null); }}>
				<Dialog size="sm" className="max-h-[90dvh] overflow-y-auto p-6">
					<Dialog.Title className="break-words text-lg font-semibold">{detail?.name}</Dialog.Title>
					<Dialog.Description className="mt-1 break-all text-sm text-kumo-subtle">{detail?.email}</Dialog.Description>
					<dl className="my-6 space-y-5 text-sm">
						<div><dt className="font-medium">Notes</dt><dd className="mt-1 whitespace-pre-wrap break-words text-kumo-subtle">{detail?.notes || "No notes"}</dd></div>
						<div><dt className="font-medium">Introduction</dt><dd className="mt-1 whitespace-pre-wrap break-words text-kumo-subtle">{detail?.introduction || "No introduction"}</dd></div>
					</dl>
					<div className="flex flex-wrap justify-end gap-2">
						{isAdmin && detail && <>
							<Button variant="destructive" onClick={() => { setDeleting(detail); setDeleteError(null); setDetail(null); }}>Delete</Button>
							<Button variant="primary" onClick={() => openEditor(detail)}>Edit</Button>
						</>}
						<Button variant="secondary" onClick={() => setDetail(null)}>Close</Button>
					</div>
				</Dialog>
			</Dialog.Root>

			<Dialog.Root open={editorOpen && isAdmin} onOpenChange={open => { if (!saving) setEditorOpen(open); }}>
				<Dialog size="sm" className="max-h-[90dvh] overflow-y-auto p-6">
					<Dialog.Title className="text-lg font-semibold">{editingId ? "Edit contact" : "New contact"}</Dialog.Title>
					<Dialog.Description className="mt-2 mb-5 text-sm text-kumo-subtle">Names, emails, notes and introductions are visible only to administrators.</Dialog.Description>
					<form onSubmit={handleSave} className="space-y-4">
						{saveError && <p role="alert" className="text-sm text-kumo-danger">{saveError}</p>}
						<fieldset disabled={saving} className="space-y-4">
							<Input label="Name" value={draft.name} required maxLength={120} onChange={event => setDraft({ ...draft, name: event.target.value })} />
							<Input label="Email" type="email" value={draft.email} required maxLength={254} onChange={event => setDraft({ ...draft, email: event.target.value })} />
							<div>
								<label htmlFor="contact-notes" className="mb-1.5 block text-sm font-medium">Notes (optional)</label>
								<textarea id="contact-notes" rows={3} maxLength={1000} value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} className="w-full resize-y rounded-md border border-kumo-line bg-kumo-base p-3 text-sm focus-visible:outline-2 focus-visible:outline-kumo-ring" />
							</div>
							<div>
								<label htmlFor="contact-introduction" className="mb-1.5 block text-sm font-medium">Introduction (optional)</label>
								<textarea id="contact-introduction" rows={5} maxLength={4000} value={draft.introduction} onChange={event => setDraft({ ...draft, introduction: event.target.value })} className="w-full resize-y rounded-md border border-kumo-line bg-kumo-base p-3 text-sm focus-visible:outline-2 focus-visible:outline-kumo-ring" />
							</div>
						</fieldset>
						<div className="flex justify-end gap-2">
							<Button variant="secondary" disabled={saving} onClick={() => setEditorOpen(false)}>Cancel</Button>
							<Button variant="primary" type="submit" loading={saving} disabled={saving || !draft.name.trim() || !draft.email.trim()}>Save</Button>
						</div>
					</form>
				</Dialog>
			</Dialog.Root>

			<Dialog.Root open={!!deleting && isAdmin} onOpenChange={open => { if (!open && !deleteContact.isPending) setDeleting(null); }}>
				<Dialog size="sm" className="p-6">
					<Dialog.Title className="text-lg font-semibold">Delete contact</Dialog.Title>
					<Dialog.Description className="mt-3 mb-5 break-words text-sm text-kumo-subtle">{`Delete “${deleting?.name}” (${deleting?.email})? This permanently removes the contact from the system directory. Sent emails are unaffected.`}</Dialog.Description>
					{deleteError && <p role="alert" className="mb-4 text-sm text-kumo-danger">{deleteError}</p>}
					<div className="flex justify-end gap-2">
						<Button variant="secondary" disabled={deleteContact.isPending} onClick={() => setDeleting(null)}>Cancel</Button>
						<Button variant="destructive" loading={deleteContact.isPending} disabled={deleteContact.isPending} onClick={handleDelete}>Confirm delete</Button>
					</div>
				</Dialog>
			</Dialog.Root>
		</main>
	);
}
