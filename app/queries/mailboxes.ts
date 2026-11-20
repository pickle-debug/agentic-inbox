// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "~/services/api";
import type { Mailbox, MailboxSummary } from "~/types";
import { queryKeys } from "./keys";

export function useMailboxes(options?: {refetchInterval?: number}) {
	return useQuery<Mailbox[]>({
		queryKey: queryKeys.mailboxes.all,
		queryFn: () => api.listMailboxes() as Promise<Mailbox[]>,
		refetchInterval: options?.refetchInterval,
	});
}

export function useMailboxSummaries() {
	return useQuery<MailboxSummary[]>({
		queryKey: ["mailbox-summaries"],
		queryFn: api.listMailboxSummaries,
		// Every poll asks each visible mailbox for its Inbox count. Up to 30 mailboxes refresh every
		// 15s; larger lists back off to at most 60s. Hidden tabs pause polling (TanStack default).
		refetchInterval: query => Math.min(60_000, Math.max(15_000, (query.state.data?.length ?? 0) * 500)),
	});
}

export function useMailbox(mailboxId: string | undefined) {
	return useQuery<Mailbox>({
		queryKey: mailboxId
			? queryKeys.mailboxes.detail(mailboxId)
			: ["mailboxes", "_disabled"],
		queryFn: () => api.getMailbox(mailboxId!) as Promise<Mailbox>,
		enabled: !!mailboxId,
	});
}

export function useCreateMailbox() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ email, name }: { email: string; name: string }) =>
			api.createMailbox(email, name),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: queryKeys.mailboxes.all });
			qc.invalidateQueries({queryKey: ["mailbox-summaries"]});
		},
	});
}

export function useUpdateMailbox() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({
			mailboxId,
			settings,
		}: { mailboxId: string; settings: unknown }) =>
			api.updateMailbox(mailboxId, settings),
		onSuccess: (_data, { mailboxId }) => {
			qc.invalidateQueries({ queryKey: queryKeys.mailboxes.detail(mailboxId) });
			qc.invalidateQueries({ queryKey: queryKeys.mailboxes.all });
			qc.invalidateQueries({queryKey: ["mailbox-summaries"]});
		},
	});
}

export function useDeleteMailbox() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (mailboxId: string) => api.deleteMailbox(mailboxId),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: queryKeys.mailboxes.all });
			qc.invalidateQueries({queryKey: ["mailbox-summaries"]});
		},
	});
}
