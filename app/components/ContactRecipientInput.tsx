import { Button, Input } from "@cloudflare/kumo";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import type { Contact } from "../../shared/contacts";
import { insertContactRecipient, recipientToken } from "~/lib/contact-recipients";
import { useContacts } from "~/queries/contacts";
import api from "~/services/api";
import { useI18n } from "~/hooks/useI18n";

type Props = {
	label?: string;
	accessibleLabel: string;
	value: string;
	onChange: (value: string) => void;
	required?: boolean;
	disabled?: boolean;
};

export default function ContactRecipientInput(props: Props) {
	const { t } = useI18n();
	const { data: session } = useQuery({ queryKey: ["session"], queryFn: api.getSession });
	// Do not mount the directory query or render cached suggestions for mailbox identities.
	if (session?.role === "admin") return <AdminContactRecipientInput {...props} />;
	return <Input
		label={props.label}
		aria-label={props.accessibleLabel}
		type="text"
		size="sm"
		className="w-full min-w-0"
		value={props.value}
		onChange={event => props.onChange(event.target.value)}
		required={props.required}
		disabled={props.disabled}
		placeholder={t("Enter email addresses, separated by commas", "输入邮箱地址，多个地址用逗号分隔")}
	/>;
}

function AdminContactRecipientInput({ label, accessibleLabel, value, onChange, required, disabled }: Props) {
	const { t } = useI18n();
	const id = useId();
	const input = useRef<HTMLInputElement>(null);
	const [open, setOpen] = useState(false);
	const [caret, setCaret] = useState(value.length);
	const [active, setActive] = useState(-1);
	const query = recipientToken(value, caret).query.slice(0, 200);
	const [search, setSearch] = useState(query);
	useEffect(() => {
		const timer = setTimeout(() => setSearch(query), 200);
		return () => clearTimeout(timer);
	}, [query]);
	const { data, isFetching, error, refetch } = useContacts(search, 1, 8, open && !disabled);
	const pending = query !== search || isFetching;
	const contacts = pending ? [] : data?.contacts ?? [];
	useEffect(() => setActive(-1), [query, data]);
	useEffect(() => {
		if (active >= 0) document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: "nearest" });
	}, [active, id]);

	const select = (contact: Contact) => {
		const next = insertContactRecipient(value, contact.email, caret);
		onChange(next.value);
		setCaret(next.caret);
		setOpen(false);
		setActive(-1);
		requestAnimationFrame(() => {
			input.current?.focus();
			input.current?.setSelectionRange(next.caret, next.caret);
			setOpen(false);
		});
	};

	return <div className="relative w-full min-w-0" onBlur={event => {
		if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
	}}>
		<Input
			ref={input}
			label={label}
			aria-label={accessibleLabel}
			type="text"
			size="sm"
			className="w-full min-w-0"
			value={value}
			required={required}
			disabled={disabled}
			autoComplete="off"
			placeholder={t("Search names, emails, notes or introductions; separate addresses with commas", "搜索姓名、邮箱、备注或介绍；多个地址用逗号分隔")}
			role="combobox"
			aria-autocomplete="list"
			aria-expanded={open && !disabled}
			aria-controls={open && !disabled ? `${id}-list` : undefined}
			aria-activedescendant={open && active >= 0 && contacts[active] ? `${id}-option-${active}` : undefined}
			onFocus={event => { setCaret(event.currentTarget.selectionStart ?? value.length); setOpen(true); }}
			onClick={() => setOpen(true)}
			onSelect={event => setCaret(event.currentTarget.selectionStart ?? value.length)}
			onChange={event => { onChange(event.target.value); setCaret(event.target.selectionStart ?? event.target.value.length); setOpen(true); setActive(-1); }}
			onKeyDown={event => {
				if (event.nativeEvent.isComposing) return;
				if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
				if (event.key === "ArrowDown" || event.key === "ArrowUp") {
					event.preventDefault(); setOpen(true);
					if (contacts.length) setActive(index => event.key === "ArrowDown" ? (index + 1) % contacts.length : (index <= 0 ? contacts.length : index) - 1);
				}
				if (event.key === "Enter" && open && active >= 0 && contacts[active]) {
					event.preventDefault(); select(contacts[active]);
				}
			}}
		/>
		{open && !disabled && <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-kumo-line bg-kumo-base shadow-lg">
			<div className="border-b border-kumo-line px-3 py-2 text-xs text-kumo-subtle">{t("System contacts", "系统联系人")}</div>
			<div id={`${id}-list`} role="listbox" aria-label={t(`${accessibleLabel} contact suggestions`, `${accessibleLabel}联系人建议`)} className="max-h-64 overflow-y-auto">
				{contacts.map((contact, index) => <div
					key={contact.id} id={`${id}-option-${index}`} role="option" aria-selected={active === index}
					className={`cursor-pointer px-3 py-2 text-sm ${active === index ? "bg-kumo-tint" : "hover:bg-kumo-tint"}`}
					onMouseDown={event => event.preventDefault()}
					onMouseEnter={() => setActive(index)}
					onClick={() => select(contact)}
				>
					<div className="font-medium break-words">{contact.name}</div>
					<div className="break-all text-kumo-subtle">{contact.email}</div>
					{contact.notes && <div className="mt-1 line-clamp-2 break-words text-xs text-kumo-subtle">{t("Notes: ", "备注：")}{contact.notes}</div>}
					{contact.introduction && <div className="line-clamp-2 break-words text-xs text-kumo-subtle">{contact.introduction}</div>}
				</div>)}
			</div>
			<div aria-live="polite" className="px-3 py-2 text-xs text-kumo-subtle">
				{pending ? t("Searching…", "正在搜索…") : error ? <>{t("Unable to load contacts. You can still enter email addresses manually.", "联系人加载失败，仍可手动输入邮箱。")}<Button type="button" size="xs" variant="ghost" onClick={() => void refetch()}>{t("Retry", "重试")}</Button></> : contacts.length === 0 ? t("No matching contacts. Enter a full email address directly.", "没有匹配联系人，可直接输入完整邮箱地址。") : data && data.totalCount > contacts.length ? t("Showing the first 8 matches. Keep typing to narrow the results.", "仅显示前 8 项，请继续输入以缩小范围。") : t("↑↓ to select, Enter to insert; or type an email address.", "↑↓ 选择，Enter 填入；也可手动输入邮箱。")}
			</div>
		</div>}
	</div>;
}
