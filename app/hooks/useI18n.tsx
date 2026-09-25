import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { isLocale, languageCookie, translateMessage, type Locale } from "~/lib/i18n";

export type Translate = (english: string, chinese: string) => string;

interface I18n {
	locale: Locale;
	dateLocale: "en-US" | "zh-CN";
	setLocale: (locale: Locale) => void;
	t: Translate;
	message: (value: string) => string;
	folderName: (id: string, fallback?: string) => string;
}

const I18nContext = createContext<I18n | null>(null);
const folderLabels: Record<string, [string, string]> = {
	inbox: ["Inbox", "收件箱"], sent: ["Sent", "已发送"],
	draft: ["Drafts", "草稿"], spam: ["Spam", "垃圾邮件"],
	trash: ["Trash", "已删除"], archive: ["Archive", "归档"],
};

export function I18nProvider({ initialLocale, children }: { initialLocale: Locale; children: ReactNode }) {
	// The server and hydration use the same request locale, with no browser-only initial state.
	const [locale, updateLocale] = useState(initialLocale);
	const setLocale = useCallback((next: Locale) => {
		if (!isLocale(next)) return;
		updateLocale(next);
		try {
			document.cookie = languageCookie(next, window.location.protocol === "https:");
		} catch {
			// Language switching still works if browser privacy settings block cookies.
		}
	}, []);
	const t = useCallback<Translate>((english, chinese) => locale === "zh" ? chinese : english, [locale]);
	const message = useCallback((value: string) => translateMessage(value, locale), [locale]);
	const folderName = useCallback((id: string, fallback?: string) => {
		const labels = Object.hasOwn(folderLabels, id) ? folderLabels[id] : undefined;
		return labels ? t(...labels) : fallback ?? id;
	}, [t]);
	const value = useMemo<I18n>(() => ({ locale, dateLocale: locale === "zh" ? "zh-CN" : "en-US", setLocale, t, message, folderName }), [locale, setLocale, t, message, folderName]);
	return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
	const context = useContext(I18nContext);
	if (!context) throw new Error("useI18n must be used within I18nProvider");
	return context;
}
