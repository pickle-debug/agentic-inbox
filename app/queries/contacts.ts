import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ContactInput } from "../../shared/contacts";
import api from "~/services/api";
import { queryKeys } from "./keys";

export function useContacts(query: string, page = 1, limit = 50, enabled = true) {
	return useQuery({
		queryKey: queryKeys.contacts.list(query, page, limit),
		queryFn: ({ signal }) => api.listContacts(query, page, limit, signal),
		enabled,
	});
}

export function useCreateContact() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: api.createContact,
		onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.contacts.all }),
	});
}

export function useUpdateContact() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: ({ id, ...contact }: ContactInput & { id: string }) => api.updateContact(id, contact),
		onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.contacts.all }),
	});
}

export function useDeleteContact() {
	const client = useQueryClient();
	return useMutation({
		mutationFn: api.deleteContact,
		onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.contacts.all }),
	});
}
