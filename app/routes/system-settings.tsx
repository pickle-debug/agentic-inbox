import { Badge, Button, Loader, useKumoToastManager } from "@cloudflare/kumo";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { Navigate } from "react-router";
import { systemSettingsSchema, type SystemSettings } from "../../shared/system-settings";
import { useI18n } from "~/hooks/useI18n";
import api from "~/services/api";

export function meta() { return [{ title: "Agentic Inbox" }]; }

export default function SystemSettingsRoute() {
	const { t, message } = useI18n();
	const toast = useKumoToastManager();
	const queryClient = useQueryClient();
	const session = useQuery({ queryKey: ["session"], queryFn: api.getSession });
	const settings = useQuery({ queryKey: ["system-settings"], queryFn: api.getSystemSettings, enabled: session.data?.role === "admin" });
	const [draft, setDraft] = useState<SystemSettings | null>(null);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	useEffect(() => { document.title = `${t("System settings", "系统设置")} · Agentic Inbox`; }, [t]);
	const values = draft ?? settings.data;
	const save = async (event: FormEvent) => {
		event.preventDefault();
		if (!values || saving) return;
		setError("");
		const parsed = systemSettingsSchema.safeParse(values);
		if (!parsed.success) { setError(message(parsed.error.issues[0].message)); return; }
		setSaving(true);
		try {
			const saved = await api.updateSystemSettings(parsed.data);
			queryClient.setQueryData(["system-settings"], saved);
			setDraft(null);
			toast.add({ title: t("Settings saved!", "设置已保存！") });
		} catch (err) {
			setError(err instanceof Error ? message(err.message) : t("Failed to save settings", "保存设置失败"));
		} finally { setSaving(false); }
	};
	if (session.data && session.data.role !== "admin") return <Navigate to="/" replace />;
	const loadError = session.error || settings.error;
	return <main className="mx-auto w-full max-w-2xl px-4 py-8 md:px-6 md:py-12">
		<h1 className="text-2xl font-semibold">{t("System settings", "系统设置")}</h1>
		<p className="mt-2 text-sm text-kumo-subtle">{t("Administrator settings for the AI assistant across all mailboxes.", "管理员统一配置所有邮箱的 AI 助手。")}</p>
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
			</fieldset>
			{error && <p role="alert" className="text-sm text-kumo-error">{error} {t("Your changes have not been saved. Try again.", "您的更改尚未保存，请重试。")}</p>}
			<div className="flex justify-end"><Button type="submit" variant="primary" loading={saving} disabled={saving}>{t("Save Changes", "保存更改")}</Button></div>
		</form>}
	</main>;
}
