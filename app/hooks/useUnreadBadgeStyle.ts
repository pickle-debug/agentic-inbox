import { useEffect } from "react";
import { create } from "zustand";

export type UnreadBadgeStyle = "count" | "dot";
const key = "inbox-unread-badge-style";
const usePreference = create<{style: UnreadBadgeStyle; setStyle: (style: UnreadBadgeStyle) => void}>(set => ({
	style: "count",
	setStyle: style => {
		set({style});
		try {localStorage.setItem(key, style);} catch { /* The preference still works when browser storage is unavailable. */ }
	},
}));

/** Browser preference only: changing badge presentation never changes mail read/unread state. */
export function useUnreadBadgeStyle() {
	const value = usePreference();
	useEffect(() => {
		const restore = () => {
			try {const next = localStorage.getItem(key) === "dot" ? "dot" : "count"; if (usePreference.getState().style !== next) usePreference.setState({style: next});} catch { /* Keep the in-memory choice. */ }
		};
		restore();
		const onStorage = (event: StorageEvent) => {if (event.key === key || event.key === null) restore();};
		window.addEventListener("storage", onStorage);
		return () => window.removeEventListener("storage", onStorage);
	}, []);
	return value;
}
