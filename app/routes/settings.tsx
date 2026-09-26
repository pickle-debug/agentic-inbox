// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Input, Loader, useKumoToastManager } from "@cloudflare/kumo";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { useMailbox, useUpdateMailbox } from "~/queries/mailboxes";
import { autoReplySettingsSchema } from "../../shared/automatic-replies";
import { forwardingSettingsSchema } from "../../shared/forwarding";
import { useI18n } from "~/hooks/useI18n";
import MailboxPasswordSettings from "~/components/MailboxPasswordSettings";

export default function SettingsRoute() {
	const { mailboxId } = useParams<{ mailboxId: string }>();
	return <MailboxSettingsForm key={mailboxId} mailboxId={mailboxId} />;
}

function MailboxSettingsForm({ mailboxId }: { mailboxId: string | undefined }) {
	const { t, message } = useI18n();
	const toastManager = useKumoToastManager();
	const { data: mailbox, error: loadError, isFetching, refetch } = useMailbox(mailboxId);
	const updateMailboxMutation = useUpdateMailbox();

	const [displayName, setDisplayName] = useState("");
	const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);
	const [autoReplySubject, setAutoReplySubject] = useState("");
	const [autoReplyMessage, setAutoReplyMessage] = useState("");
	const [autoReplyErrors, setAutoReplyErrors] = useState<{ subject?: string; message?: string }>({});
	const [forwardingEnabled, setForwardingEnabled] = useState(false);
	const [forwardingEmail, setForwardingEmail] = useState("");
	const [forwardingError, setForwardingError] = useState("");
	const [isSaving, setIsSaving] = useState(false);
	const [saveError, setSaveError] = useState("");

	useEffect(() => {
		if (mailbox) {
			setDisplayName(mailbox.settings?.fromName || mailbox.name || "");
			setAutoReplyEnabled(mailbox.settings?.autoReply?.enabled === true);
			setAutoReplySubject(mailbox.settings?.autoReply?.subject || "");
			setAutoReplyMessage(mailbox.settings?.autoReply?.message || "");
			setAutoReplyErrors({});
			setForwardingEnabled(mailbox.settings?.forwarding?.enabled === true);
			setForwardingEmail(mailbox.settings?.forwarding?.email || "");
			setForwardingError("");
		}
	}, [mailbox]);

	const handleSave = async () => {
		if (!mailbox || !mailboxId || isSaving) return;
		setSaveError("");
		const autoReply = autoReplySettingsSchema.safeParse({
			enabled: autoReplyEnabled,
			subject: autoReplySubject,
			message: autoReplyMessage,
		});
		const forwarding = forwardingSettingsSchema(mailboxId).safeParse({
			enabled: forwardingEnabled,
			email: forwardingEmail,
		});
		setAutoReplyErrors(autoReply.success ? {} : {
			subject: autoReply.error.flatten().fieldErrors.subject?.[0],
			message: autoReply.error.flatten().fieldErrors.message?.[0],
		});
		setForwardingError(forwarding.success ? "" : forwarding.error.issues[0].message);
		if (!autoReply.success || !forwarding.success) return;
		setIsSaving(true);
		const settings = {
			fromName: displayName,
			autoReply: autoReply.data,
			forwarding: forwarding.data,
		};
		try {
			await updateMailboxMutation.mutateAsync({ mailboxId, settings });
			toastManager.add({ title: t("Settings saved!", "设置已保存！") });
		} catch (error) {
			const errorText = error instanceof Error ? error.message : t("Failed to save settings", "保存设置失败");
			setSaveError(errorText);
			toastManager.add({
				title: message(errorText),
				variant: "error",
			});
		} finally {
			setIsSaving(false);
		}
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

	return (
		<div className="h-full min-h-0 flex flex-col bg-kumo-base">
			<header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-kumo-line px-4 py-3.5 md:px-5">
				<h1 className="text-lg font-semibold text-kumo-default">{t("Mailbox settings", "邮箱设置")}</h1>
				<Button variant="primary" size="sm" onClick={handleSave} loading={isSaving} disabled={isSaving}>{t("Save Changes", "保存更改")}</Button>
			</header>
			{saveError && <p role="alert" className="shrink-0 border-b border-kumo-line px-4 py-3 text-sm text-kumo-error md:px-5">{message(saveError)} {t("Your changes have not been saved. Try again.", "您的更改尚未保存，请重试。")}</p>}
			<div className="min-h-0 flex-1 overflow-y-auto">
			<div className="max-w-2xl space-y-6 px-4 py-5 md:px-5">
				<p className="break-all text-sm text-kumo-subtle">{t(`Applies only to ${mailbox.email}.`, `仅对 ${mailbox.email} 生效。`)}</p>
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

				{/* Automatic Replies */}
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<h2 className="text-sm font-medium text-kumo-default mb-2">{t("Automatic Replies", "自动回复")}</h2>
					<p className="text-xs text-kumo-subtle mb-4 break-words">
						{t(`Applies only to new mail received by ${mailbox.email}. Sends your fixed message, without AI generation.`, `仅适用于 ${mailbox.email} 收到的新邮件。发送您填写的固定内容，不使用 AI 生成。`)}
					</p>
					<label className="flex items-start gap-3 cursor-pointer">
						<input
							type="checkbox"
							checked={autoReplyEnabled}
							disabled={isSaving}
							onChange={(e) => {
								setAutoReplyEnabled(e.target.checked);
								setAutoReplyErrors({});
							}}
							className="mt-0.5 size-4 shrink-0 accent-kumo-accent"
						/>
						<span>
							<span className="block text-sm text-kumo-default">{t("Send a fixed automatic reply", "发送固定内容的自动回复")}</span>
							<span className="block text-xs text-kumo-subtle mt-1">{t("Sends the message below automatically, without review.", "自动发送下方消息，无需审核。")}</span>
						</span>
					</label>
					<div className="mt-4 space-y-3">
						<Input
							label={t("Reply subject (optional)", "回复主题（可选）")}
							value={autoReplySubject}
							disabled={isSaving}
							maxLength={200}
							aria-invalid={!!autoReplyErrors.subject}
							aria-describedby={autoReplyErrors.subject ? "auto-reply-subject-help auto-reply-subject-error" : "auto-reply-subject-help"}
							onChange={(e) => {
								setAutoReplySubject(e.target.value);
								setAutoReplyErrors((errors) => ({ ...errors, subject: undefined }));
							}}
						/>
						{autoReplyErrors.subject && <p id="auto-reply-subject-error" role="alert" className="text-xs text-kumo-error">{message(autoReplyErrors.subject)}</p>}
						<p id="auto-reply-subject-help" className="text-xs text-kumo-subtle">{t("Leave empty to use “Re: original subject”. Up to 200 characters.", "留空则使用“Re: 原始主题”。最多 200 个字符。")}</p>
						<div>
							<label htmlFor="auto-reply-message" className="block text-sm text-kumo-default mb-2">{t("Reply message", "回复内容")}</label>
							<textarea
								id="auto-reply-message"
								value={autoReplyMessage}
								disabled={isSaving}
								required={autoReplyEnabled}
								maxLength={10000}
								rows={5}
								placeholder={t("Hello, we have received your email. Please do not send it again.", "您好，我们已收到您的邮件，请勿重复发送。")}
								aria-invalid={!!autoReplyErrors.message}
								aria-describedby={autoReplyErrors.message ? "auto-reply-message-help auto-reply-message-error" : "auto-reply-message-help"}
								onChange={(e) => {
									setAutoReplyMessage(e.target.value);
									setAutoReplyErrors((errors) => ({ ...errors, message: undefined }));
								}}
								className="w-full resize-y rounded-lg border border-kumo-line bg-kumo-recessed px-3 py-2 text-sm text-kumo-default placeholder:text-kumo-subtle focus:outline-none focus:ring-1 focus:ring-kumo-ring disabled:opacity-50"
							/>
							{autoReplyErrors.message && <p id="auto-reply-message-error" role="alert" className="text-xs text-kumo-error mt-2">{message(autoReplyErrors.message)}</p>}
							<p id="auto-reply-message-help" className="text-xs text-kumo-subtle mt-2">{t("Plain text only, up to 10,000 characters. You can edit and save this template while automatic replies are off.", "仅支持纯文本，最多 10,000 个字符。关闭自动回复时也可编辑和保存模板。")}</p>
						</div>
						<p className="text-xs text-kumo-subtle">{t("Replies at most once per sender every 24 hours for this mailbox. Automatic and bulk mail are skipped. If sending fails, the original email stays in your Inbox.", "此邮箱每 24 小时最多向同一发件人回复一次。自动邮件和群发邮件会被跳过。若发送失败，原始邮件仍保留在收件箱中。")}</p>
					</div>
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

				<MailboxPasswordSettings mailboxId={mailbox.id} email={mailbox.email} />
			</div>
			</div>
		</div>
	);
}
