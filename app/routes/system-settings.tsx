import { Badge, Button, Loader, useKumoToastManager } from "@cloudflare/kumo";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { Navigate } from "react-router";
import { systemSettingsSchema, type SystemSettings } from "../../shared/system-settings";
import { emailPrivacySettingsSchema } from "../../shared/email-privacy";
import { useI18n } from "~/hooks/useI18n";
import api from "~/services/api";
import ReceptionSettings from "~/components/ReceptionSettings";
import UnreadBadge from "~/components/UnreadBadge";
import { queryKeys } from "~/queries/keys";

export function meta() { return [{ title: "Agentic Inbox" }]; }

export default function SystemSettingsRoute() {
	const { t, message } = useI18n();
	const toast = useKumoToastManager();
	const queryClient = useQueryClient();
	const session = useQuery({ queryKey: ["session"], queryFn: api.getSession });
	const settings = useQuery({ queryKey: ["system-settings"], queryFn: api.getSystemSettings, enabled: session.data?.role === "admin" });
	const config = useQuery({ queryKey: queryKeys.config, queryFn: api.getConfig, enabled: session.data?.role === "admin" });
	const [draft, setDraft] = useState<SystemSettings | null>(null);
	const [privacyText, setPrivacyText] = useState<string | null>(null);
	const [privacyError, setPrivacyError] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	useEffect(() => { document.title = `${t("System settings", "系统设置")} · Agentic Inbox`; }, [t]);
	const values = draft ?? settings.data;
	const privacy = values?.privacy ?? { enabled: false, domains: [] };
	const privacyDomains = privacyText ?? privacy.domains.join("\n");
	const save = async (event: FormEvent) => {
		event.preventDefault();
		if (!values || saving) return;
		setError("");
		const privacyResult = emailPrivacySettingsSchema.safeParse({ enabled: privacy.enabled, domains: privacyDomains.split(/[\s,，;；]+/).filter(Boolean) });
		setPrivacyError(privacyResult.success ? "" : message(privacyResult.error.issues[0].message));
		if (!privacyResult.success) return;
		const parsed = systemSettingsSchema.safeParse({ ...values, privacy: privacyResult.data });
		if (!parsed.success) { setError(message(parsed.error.issues[0].message)); return; }
		setSaving(true);
		try {
			const saved = await api.updateSystemSettings(parsed.data);
			queryClient.setQueryData(["system-settings"], saved);
			// Badges and readers take the style and sender policy from the shared config.
			void queryClient.invalidateQueries({ queryKey: queryKeys.config });
			setDraft(null);
			setPrivacyText(null);
			toast.add({ title: t("Settings saved!", "设置已保存！") });
		} catch (err) {
			setError(err instanceof Error ? message(err.message) : t("Failed to save settings", "保存设置失败"));
		} finally { setSaving(false); }
	};
	if (session.data && session.data.role !== "admin") return <Navigate to="/" replace />;
	const loadError = session.error || settings.error;
	return <main className="mx-auto w-full max-w-2xl px-4 py-8 md:px-6 md:py-12">
		<h1 className="text-2xl font-semibold">{t("System settings", "系统设置")}</h1>
		<p className="mt-2 text-sm text-kumo-subtle">{t("Configure receiving domains, and the AI assistant, email privacy and unread alerts for all mailboxes.", "管理收信域名、自动建箱，以及所有邮箱的 AI 助手、邮件隐私保护和未读提示。")}</p>
		{session.data?.role === "admin" && <ReceptionSettings />}
		{loadError ? <div className="mt-6 space-y-3">
			<p role="alert" className="text-sm text-kumo-error">{message(loadError.message)}</p>
			<Button size="sm" disabled={session.isFetching || settings.isFetching} onClick={() => void (session.isError ? session.refetch() : settings.refetch())}>{t("Retry", "重试")}</Button>
		</div> : !session.data || !values ? <div role="status" aria-label={t("Loading settings", "加载设置")} className="flex justify-center py-16"><Loader size="lg" /></div> : <form onSubmit={save} className="mt-6 space-y-6">
			<fieldset disabled={saving} className="space-y-6 rounded-lg border border-kumo-line bg-kumo-base p-5">
				<label className="flex cursor-pointer items-start gap-3">
					<input type="checkbox" checked={values.autoDraftRepliesEnabled} onChange={(event) => setDraft({ ...values, autoDraftRepliesEnabled: event.target.checked })} className="mt-0.5 size-4 shrink-0 accent-kumo-accent" />
					<span><span className="block text-sm font-medium">{t("Create AI reply drafts for new mail", "收到新邮件时生成 AI 回复草稿")}</span><span className="mt-1 block text-xs text-kumo-subtle">{t("Applies to all mailboxes. Drafts require review and manual sending. Off by default.", "对所有邮箱生效。草稿需要审核后手动发送，默认关闭。")}</span></span>
				</label>
				<div className="border-t border-kumo-line pt-5">
					<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
						<div className="flex flex-wrap items-center gap-2"><label htmlFor="system-agent-prompt" className="text-sm font-medium">{t("AI Agent Prompt", "AI 助手提示词")}</label><Badge variant={values.agentSystemPrompt.trim() ? "primary" : "secondary"}>{values.agentSystemPrompt.trim() ? t("Custom", "自定义") : t("Default", "默认")}</Badge></div>
						{values.agentSystemPrompt && <Button type="button" variant="ghost" size="xs" icon={<ArrowCounterClockwiseIcon size={14} />} onClick={() => setDraft({ ...values, agentSystemPrompt: "" })}>{t("Reset to default", "恢复默认")}</Button>}
					</div>
					<p id="system-agent-prompt-help" className="mb-3 text-xs text-kumo-subtle">{t("Sets writing style and behavior across all mailbox assistants and AI reply drafts. Leave empty for the built-in default. Up to 20,000 characters. Save to apply changes. Fixed automatic replies remain configured separately in each mailbox.", "统一设置所有邮箱助手及 AI 回复草稿的写作风格和行为。留空使用内置默认提示词，最多 20,000 个字符，保存后生效。固定内容的自动回复仍在各邮箱中单独设置。")}</p>
					<textarea id="system-agent-prompt" value={values.agentSystemPrompt} onChange={(event) => setDraft({ ...values, agentSystemPrompt: event.target.value })} maxLength={20000} rows={12} aria-describedby="system-agent-prompt-help" placeholder={t("Leave empty to use the built-in default prompt.", "留空使用内置默认提示词。")}
						className="w-full resize-y rounded-lg border border-kumo-line bg-kumo-recessed px-3 py-2 text-sm text-kumo-default placeholder:text-kumo-subtle focus:outline-none focus:ring-1 focus:ring-kumo-ring disabled:opacity-50" />
				</div>
				<section className="border-t border-kumo-line pt-5" aria-labelledby="system-privacy-heading">
					<h2 id="system-privacy-heading" className="text-sm font-medium">{t("Email privacy", "邮件隐私保护")}</h2>
					<label className="mt-3 flex cursor-pointer items-start gap-3">
						<input type="checkbox" checked={privacy.enabled} onChange={(event) => { setDraft({ ...values, privacy: { ...privacy, enabled: event.target.checked } }); setPrivacyError(""); }} className="mt-0.5 size-4 shrink-0 accent-kumo-accent" />
						<span className="text-sm">{t("Use private reading for these sender domains in every mailbox", "所有邮箱对以下发件人域名启用隐私阅读")}</span>
					</label>
					<p className="mt-2 text-xs text-kumo-subtle">{t("Applies to every mailbox, including shared access. Matching messages show text, extracted links and HTML source without rendering HTML or loading remote content. Other messages display normally.", "对所有邮箱生效，包括分享访问。匹配的邮件仅显示文本、提取的链接及 HTML 源码，不渲染 HTML、不加载远程内容；其他邮件正常显示。")}</p>
					{config.data?.privacy === null && privacy.domains.length > 0 && <p className="mt-2 text-xs text-kumo-warning">{t("Pre-filled with the rules individual mailboxes used before. Save to apply them to every mailbox.", "已预填各邮箱原来单独设置的域名，保存后对所有邮箱生效。")}</p>}
					<label htmlFor="system-privacy-domains" className="mt-4 mb-2 block text-sm">{t("Sender domains", "发件人域名")}</label>
					<textarea id="system-privacy-domains" value={privacyDomains} rows={4} maxLength={25500} placeholder={"example.com\nmail.example.org"} aria-invalid={!!privacyError} aria-describedby={privacyError ? "system-privacy-help system-privacy-error" : "system-privacy-help"} onChange={(event) => { setPrivacyText(event.target.value); setPrivacyError(""); }}
						className="w-full resize-y rounded-lg border border-kumo-line bg-kumo-recessed px-3 py-2 text-sm text-kumo-default placeholder:text-kumo-subtle focus:outline-none focus:ring-1 focus:ring-kumo-ring disabled:opacity-50" />
					<p id="system-privacy-help" className="mt-2 text-xs text-kumo-subtle">{t("One domain per line, or separate with commas. Includes subdomains: example.com also matches mail.example.com. Enter domains only, without @, URLs or wildcards. Up to 100 domains; the list is kept when switched off.", "每行一个，也可用逗号分隔。包含子域名：example.com 同时匹配 mail.example.com。仅填写域名，不含 @、网址或通配符。最多 100 个，关闭后保留名单。")}</p>
					{privacyError && <p id="system-privacy-error" role="alert" className="mt-2 text-xs text-kumo-error">{privacyError}</p>}
				</section>
				<fieldset className="border-t border-kumo-line pt-5" aria-describedby="unread-badge-style-help">
					<legend className="float-left w-full text-sm font-medium">{t("Unread alerts", "未读提示")}</legend>
					<p id="unread-badge-style-help" className="clear-left pt-1 text-xs text-kumo-subtle">{t("How mailboxes with unread mail are marked in the mailbox list, for everyone who uses this inbox, including shared visitors.", "邮箱有未读邮件时，在邮箱列表中的提示样式。对所有使用者生效，包括分享访客。")}</p>
					<div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
						{(["count", "dot"] as const).map(option => <label key={option} className="flex cursor-pointer items-center gap-2 text-sm">
							<input type="radio" name="unread-badge-style" value={option} checked={(values.unreadBadgeStyle ?? "count") === option} onChange={() => setDraft({ ...values, unreadBadgeStyle: option })} className="size-4 shrink-0 accent-kumo-accent" />
							{option === "count" ? t("Red badge with count", "红点数字") : t("Red dot only", "仅红点")}
							<span aria-hidden="true" className="inline-flex"><UnreadBadge count={3} label="" style={option} /></span>
						</label>)}
					</div>
				</fieldset>
			</fieldset>
			{error && <p role="alert" className="text-sm text-kumo-error">{error} {t("Your changes have not been saved. Try again.", "您的更改尚未保存，请重试。")}</p>}
			<div className="flex justify-end"><Button type="submit" variant="primary" loading={saving} disabled={saving}>{t("Save Changes", "保存更改")}</Button></div>
		</form>}
	</main>;
}
