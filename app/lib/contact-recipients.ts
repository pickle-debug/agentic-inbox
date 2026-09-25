export function recipientToken(value: string, caret = value.length) {
	const position = Math.max(0, Math.min(caret, value.length));
	const start = position === 0 ? 0 : value.lastIndexOf(",", position - 1) + 1;
	const nextComma = value.indexOf(",", position);
	const end = nextComma < 0 ? value.length : nextComma;
	return { start, end, query: value.slice(start, end).trim() };
}

export function insertContactRecipient(value: string, email: string, caret = value.length) {
	const { start, end } = recipientToken(value, caret);
	const otherAddresses = `${value.slice(0, start)}${value.slice(end)}`.split(",").map(address => address.trim().toLowerCase());
	// Replace only the token being edited, preserving other To/CC/BCC recipients.
	const selected = otherAddresses.includes(email.toLowerCase()) ? "" : email;
	const prefix = value.slice(0, start);
	const suffix = value.slice(end);
	const before = [prefix.replace(/,\s*$/, "").trim(), selected].filter(Boolean).join(", ");
	const after = suffix.replace(/^,\s*/, "").trim();
	return { value: `${before}${before ? ", " : ""}${after}`, caret: before.length + (before ? 2 : 0) };
}
