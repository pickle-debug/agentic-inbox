// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Badge, Button, Input, Loader, useKumoToastManager } from "@cloudflare/kumo";
import { RobotIcon, ArrowCounterClockwiseIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { useMailbox, useUpdateMailbox } from "~/queries/mailboxes";
import { forwardingSettingsSchema } from "../../shared/forwarding";
import LanguageSelector from "~/components/LanguageSelector";
import { useI18n } from "~/hooks/useI18n";

// Placeholder shown in the textarea when no custom prompt is set.
// The authoritative default prompt lives in workers/agent/index.ts (DEFAULT_SYSTEM_PROMPT).
const PROMPT_PLACEHOLDER = `You are an email assistant that helps manage this inbox. You read emails, draft replies, and help organize conversations.\n\nWrite like a real person. Short, direct, flowing prose. Plain text only.\n\n(Leave empty to use the full built-in default prompt)`;

const PROMPT_PLACEHOLDER_ZH = "你是一位帮助管理邮箱的邮件助手。你会阅读邮件、起草回复，并协助整理对话。\n\n像真人一样写作，简洁、直接、流畅。只使用纯文本。\n\n（留空则使用完整的内置默认提示词）";

export default function SettingsRoute() {
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const { t, message } = useI18n();
	const toastManager = useKumoToastManager();
	const { data: mailbox, error: loadError, isFetching, refetch } = useMailbox(mailboxId);
	const updateMailboxMutation = useUpdateMailbox();

	const [displayName, setDisplayName] = useState("");
	const [agentPrompt, setAgentPrompt] = useState("");
	const [autoDraftEnabled, setAutoDraftEnabled] = useState(false);
	const [forwardingEnabled, setForwardingEnabled] = useState(false);
	const [forwardingEmail, setForwardingEmail] = useState("");
	const [forwardingError, setForwardingError] = useState("");
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		if (mailbox) {
			setDisplayName(mailbox.settings?.fromName || mailbox.name || "");
			setAgentPrompt(mailbox.settings?.agentSystemPrompt || "");
			setAutoDraftEnabled(mailbox.settings?.autoDraftRepliesEnabled === true);
			setForwardingEnabled(mailbox.settings?.forwarding?.enabled === true);
			setForwardingEmail(mailbox.settings?.forwarding?.email || "");
			setForwardingError("");
		}
	}, [mailbox]);

	const handleSave = async () => {
		if (!mailbox || !mailboxId || isSaving) return;
		const forwarding = forwardingSettingsSchema(mailboxId).safeParse({
			enabled: forwardingEnabled,
			email: forwardingEmail,
		});
		if (!forwarding.success) {
			setForwardingError(forwarding.error.issues[0].message);
			return;
		}
		setForwardingError("");
		setIsSaving(true);
		const settings = {
			...mailbox.settings,
			fromName: displayName,
			// Send an explicit empty value on reset: omitted fields are preserved by the settings API.
			agentSystemPrompt: agentPrompt.trim(),
			autoDraftRepliesEnabled: autoDraftEnabled,
			forwarding: forwarding.data,
		};
		try {
			await updateMailboxMutation.mutateAsync({ mailboxId, settings });
			toastManager.add({ title: t("Settings saved!", "设置已保存！") });
		} catch (error) {
			toastManager.add({
				title: error instanceof Error ? message(error.message) : t("Failed to save settings", "保存设置失败"),
				variant: "error",
			});
		} finally {
			setIsSaving(false);
		}
	};

	const handleResetPrompt = () => {
		setAgentPrompt("");
	};

	if (!mailbox) {
		if (loadError) {
			return (
				<div className="px-4 py-10 md:px-8 space-y-4">
					<p role="alert" className="text-sm text-kumo-default">
						{message(loadError.message) || t("Failed to load mailbox settings.", "加载邮箱设置失败。")}
					</p>
					<Button onClick={() => void refetch()} loading={isFetching} disabled={isFetching}>
						{t("Try again", "重试")}
					</Button>
				</div>
			);
		}
		return (
			<div className="flex justify-center py-20">
				<Loader size="lg" />
			</div>
		);
	}

	const isCustomPrompt = agentPrompt.trim().length > 0;

	return (
		<div className="max-w-2xl px-4 py-4 md:px-8 md:py-6 h-full overflow-y-auto">
			<h1 className="text-lg font-semibold text-kumo-default mb-6">{t("Settings", "设置")}</h1>

			<div className="space-y-6">
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<LanguageSelector />
					<p className="text-xs text-kumo-subtle mt-2">{t("Applies immediately and is remembered in this browser. Email content stays unchanged.", "切换后立即生效，并在此浏览器中记住选择。邮件内容保持不变。")}</p>
				</div>
				{/* Account */}
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="text-sm font-medium text-kumo-default mb-4">
						{t("Account", "账号")}
					</div>
					<div className="space-y-3">
						<Input
							label={t("Display Name", "显示名称")}
							value={displayName}
							disabled={isSaving}
							onChange={(e) => setDisplayName(e.target.value)}
						/>
						<Input label={t("Email", "邮箱")} type="email" value={mailbox.email} disabled />
					</div>
				</div>

				{/* Automatic Draft Replies */}
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="text-sm font-medium text-kumo-default mb-2">
						{t("Automatic Draft Replies", "自动回复草稿")}
					</div>
					<label className="flex items-start gap-3 cursor-pointer">
						<input
							type="checkbox"
							checked={autoDraftEnabled}
							disabled={isSaving}
							onChange={(e) => setAutoDraftEnabled(e.target.checked)}
							className="mt-0.5 size-4 accent-kumo-accent"
						/>
						<span>
							<span className="block text-sm text-kumo-default">{t("Create a reply draft when new mail arrives", "收到新邮件时生成回复草稿")}</span>
							<span className="block text-xs text-kumo-subtle mt-1">{t("Off by default. When disabled, incoming mail is stored without generating an AI reply.", "默认关闭。关闭时，新邮件会正常保存，但不会生成 AI 回复草稿。")}</span>
						</span>
					</label>
				</div>

				{/* Automatic Forwarding */}
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="text-sm font-medium text-kumo-default mb-2">
						{t("Automatic Forwarding", "自动转发")}
					</div>
					<label className="flex items-start gap-3 cursor-pointer">
						<input
							type="checkbox"
							checked={forwardingEnabled}
							disabled={isSaving}
							onChange={(e) => {
								setForwardingEnabled(e.target.checked);
								setForwardingError("");
							}}
							className="mt-0.5 size-4 accent-kumo-accent"
						/>
						<span>
							<span className="block text-sm text-kumo-default">{t("Forward new mail to another email address", "将新邮件转发到其他邮箱")}</span>
							<span className="block text-xs text-kumo-subtle mt-1">{t("Off by default. Forwards the original message and attachments while keeping a copy in this Inbox.", "默认关闭。转发原始邮件和附件，同时在当前邮箱中保留副本。")}</span>
						</span>
					</label>
					<div className="mt-4">
						<Input
							label={t("Forwarding email address", "转发邮箱地址")}
							type="email"
							value={forwardingEmail}
							disabled={!forwardingEnabled || isSaving}
							required={forwardingEnabled || undefined}
							aria-invalid={!!forwardingError}
							aria-describedby={forwardingError ? "forwarding-help forwarding-error" : "forwarding-help"}
							onChange={(e) => {
								setForwardingEmail(e.target.value);
								setForwardingError("");
							}}
						/>
						{forwardingError && (
							<p id="forwarding-error" role="alert" className="text-xs text-kumo-error mt-2">{message(forwardingError)}</p>
						)}
						<p id="forwarding-help" className="text-xs text-kumo-subtle mt-2">
							{t("First verify this address in Cloudflare Email Routing > Destination addresses. Turning forwarding off keeps the address for later.", "请先在 Cloudflare Email Routing > Destination addresses 中验证此地址。关闭转发后会保留地址，便于下次使用。")}
						</p>
						<p className="text-xs text-kumo-subtle mt-2">
							{t("If forwarding fails, the original email stays in your Inbox. Check Worker logs for the reason.", "若转发失败，原始邮件仍保留在收件箱中。可查看 Worker 日志了解原因。")}
						</p>
					</div>
				</div>

				{/* Agent System Prompt */}
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="flex items-center justify-between mb-4">
						<div className="flex items-center gap-2">
							<RobotIcon size={16} weight="duotone" className="text-kumo-subtle" />
							<span className="text-sm font-medium text-kumo-default">
								{t("AI Agent Prompt", "AI 助手提示词")}
							</span>
							{isCustomPrompt ? (
								<Badge variant="primary">{t("Custom", "自定义")}</Badge>
							) : (
								<Badge variant="secondary">{t("Default", "默认")}</Badge>
							)}
						</div>
						{isCustomPrompt && (
							<Button
								variant="ghost"
								size="xs"
								icon={<ArrowCounterClockwiseIcon size={14} />}
								onClick={handleResetPrompt}
								disabled={isSaving}
							>
								{t("Reset to default", "恢复默认")}
							</Button>
						)}
					</div>
					<p className="text-xs text-kumo-subtle mb-3">
						{t("Customize how the AI agent behaves for this mailbox. Leave empty to use the built-in default prompt.", "自定义此邮箱 AI 助手的行为。留空则使用内置默认提示词。")}
					</p>
					<textarea
						value={agentPrompt}
						disabled={isSaving}
						onChange={(e) => setAgentPrompt(e.target.value)}
						placeholder={t(PROMPT_PLACEHOLDER, PROMPT_PLACEHOLDER_ZH)}
						rows={12}
						className="w-full resize-y rounded-lg border border-kumo-line bg-kumo-recessed px-3 py-2 text-xs text-kumo-default placeholder:text-kumo-subtle focus:outline-none focus:ring-1 focus:ring-kumo-ring font-mono leading-relaxed"
					/>
					<p className="text-xs text-kumo-subtle mt-2">
						{t("The prompt is sent as the system message to the AI model. It controls the agent's personality, writing style, and behavior rules.", "提示词会作为系统消息发送给 AI 模型，用于控制助手的个性、写作风格和行为规则。")}
					</p>
				</div>

				{/* Save */}
				<div className="flex justify-end">
					<Button variant="primary" onClick={handleSave} loading={isSaving} disabled={isSaving}>
						{t("Save Changes", "保存更改")}
					</Button>
				</div>
			</div>
		</div>
	);
}
