export interface EmailLink {
	url: string;
	label: string;
}

/** Parse in an inert template. Never attach its nodes to a live document. */
export function extractEmailContent(body: string): { text: string; links: EmailLink[] } {
	const template = document.createElement("template");
	template.innerHTML = body;
	const root = template.content;
	root.querySelectorAll("script, style, template, noscript, iframe, object, embed, svg, math, head, link, meta, base").forEach(node => node.remove());
	const links = new Map<string, EmailLink>();
	const addLink = (value: string, label = "") => {
		const url = value.trim();
		// Keep the original decoded URL, including its token, query order and fragment.
		// Never resolve relative URLs against the inbox, or accept executable schemes.
		if (!/^https?:\/\//i.test(url) || /[\s\u0000-\u001f\u007f]/u.test(url)) return;
		try {
			const parsed = new URL(url);
			if (!parsed.hostname || parsed.username || parsed.password) return;
			if (!links.has(url)) links.set(url, { url, label: label.replace(/\s+/g, " ").trim() });
		} catch { /* Ignore malformed URLs without contacting them. */ }
	};
	for (const anchor of root.querySelectorAll("a[href]")) {
		addLink(anchor.getAttribute("href") || "", anchor.textContent || "");
	}
	// Preserve reading order and paragraph boundaries without rendering email markup.
	for (const node of root.querySelectorAll("br, p, div, section, article, header, footer, h1, h2, h3, h4, h5, h6, li, tr, blockquote, pre")) {
		if (node.tagName === "BR") node.replaceWith("\n");
		else { node.prepend("\n"); node.append("\n"); }
	}
	const text = (root.textContent || "").replace(/\r\n?/g, "\n").replace(/[\t ]+\n/g, "\n").replace(/\n[\t ]+/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
	// Some senders supply only plain text, or put a fallback URL beside a button.
	for (const match of text.matchAll(/https?:\/\/[^\s<>"\u0000-\u001f\u007f]+/gi)) {
		addLink(match[0]);
	}
	return { text, links: [...links.values()] };
}
