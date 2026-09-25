// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Banner, Button, Input } from "@cloudflare/kumo";
import { FloppyDiskIcon, PaperPlaneTiltIcon, XIcon } from "@phosphor-icons/react";
import { useParams } from "react-router";
import { useComposeForm } from "~/hooks/useComposeForm";
import ComposeAttachments from "./ComposeAttachments";
import ContactRecipientInput from "./ContactRecipientInput";
import RichTextEditor from "./RichTextEditor";
import { useI18n } from "~/hooks/useI18n";

export default function ComposePanel() {
	const { t } = useI18n();
	const { mailboxId, folder } = useParams<{
		mailboxId: string;
		folder: string;
	}>();

	const {
		to,
		setTo,
		cc,
		setCc,
		bcc,
		setBcc,
		showCcBcc,
		setShowCcBcc,
		subject,
		setSubject,
		body,
		setBody,
		attachments,
		isDraggingAttachments,
		error,
		isSavingDraft,
		isSending,
		formTitle,
		handleSaveDraft,
		handleSend,
		addAttachments,
		removeAttachment,
		handleAttachmentDragEnter,
		handleAttachmentDragOver,
		handleAttachmentDragLeave,
		handleAttachmentDrop,
		closeCompose,
		closePanel,
	} = useComposeForm(mailboxId, folder);

	return (
		<div className="flex flex-col h-full bg-kumo-base">
			<div className="flex items-center justify-between px-4 py-3 border-b border-kumo-line shrink-0 md:px-6">
				<h2 className="text-base font-semibold text-kumo-default">
					{formTitle}
				</h2>
				<div className="flex items-center gap-1">
					<Button
						variant="ghost"
						shape="square"
						size="sm"
						icon={<XIcon size={18} />}
						onClick={closeCompose}
						disabled={isSending}
						aria-label={t("Close compose", "关闭写信")}
					/>
				</div>
			</div>

			<form
				onSubmit={(e) => handleSend(e, closePanel)}
				onDragEnterCapture={handleAttachmentDragEnter}
				onDragOverCapture={handleAttachmentDragOver}
				onDragLeaveCapture={handleAttachmentDragLeave}
				onDropCapture={handleAttachmentDrop}
				className="flex flex-col flex-1 min-h-0 overflow-y-auto"
			>
				<div className="p-4 md:p-6 space-y-4">
					{error && <Banner variant="error" text={error} />}

					<div className="space-y-3">
						<div className="space-y-1.5">
							<div className="flex items-center justify-between gap-2">
								<span className="text-sm font-medium text-kumo-subtle">{t("To", "收件人")}</span>
								{!showCcBcc && (
									<button
										type="button"
										onClick={() => setShowCcBcc(true)}
										className="shrink-0 text-xs text-kumo-link hover:text-kumo-link-hover font-medium"
									>
										{t("CC / BCC", "抄送 / 密送")}
									</button>
								)}
							</div>
							<ContactRecipientInput
								accessibleLabel={t("Recipients", "收件人")}
								value={to}
								onChange={setTo}
								disabled={isSending || isSavingDraft}
								required
							/>
						</div>

						{showCcBcc && (
							<div className="space-y-1.5">
								<div className="text-sm font-medium text-kumo-subtle">
									{t("CC", "抄送")}
								</div>
								<div className="flex-1">
									<ContactRecipientInput
										accessibleLabel={t("CC", "抄送")}
										value={cc}
										onChange={setCc}
										disabled={isSending || isSavingDraft}
									/>
								</div>
							</div>
						)}

						{showCcBcc && (
							<div className="space-y-1.5">
								<div className="text-sm font-medium text-kumo-subtle">
									{t("BCC", "密送")}
								</div>
								<div className="flex-1">
									<ContactRecipientInput
										accessibleLabel={t("BCC", "密送")}
										value={bcc}
										onChange={setBcc}
										disabled={isSending || isSavingDraft}
									/>
								</div>
							</div>
						)}

						<div className="flex items-center gap-2">
							<label className="text-sm font-medium text-kumo-subtle w-14 shrink-0">
								{t("Subject", "主题")}
							</label>
							<div className="flex-1">
								<Input
									type="text"
									placeholder={t("Email subject", "邮件主题")}
									aria-label={t("Subject", "主题")}
									size="sm"
									value={subject}
									onChange={(e) => setSubject(e.target.value)}
									required
								/>
							</div>
						</div>
					</div>

					<div className="border border-kumo-line rounded-md overflow-hidden bg-kumo-base">
						<RichTextEditor
							value={body}
							onChange={setBody}
						/>
					</div>

					<ComposeAttachments
						attachments={attachments}
						isDragging={isDraggingAttachments}
						disabled={isSavingDraft || isSending}
						onAddFiles={addAttachments}
						onRemove={removeAttachment}
					/>
				</div>

				{/* Footer actions */}
				<div className="mt-auto px-4 py-3 border-t border-kumo-line bg-kumo-fill/30 shrink-0 md:px-6">
					<div className="flex items-center justify-between">
						<Button type="button" variant="ghost" size="sm" onClick={closeCompose} disabled={isSending}>
							{t("Discard", "放弃")}
						</Button>
						<div className="flex items-center gap-2">
							<Button
								type="button"
								variant="secondary"
								size="sm"
								loading={isSavingDraft}
								disabled={isSending}
								icon={<FloppyDiskIcon size={14} />}
								onClick={handleSaveDraft}
							>
								{isSavingDraft ? t("Saving...", "正在保存…") : t("Save as Draft", "存为草稿")}
							</Button>
							<Button
								type="submit"
								variant="primary"
								size="sm"
								loading={isSending}
								disabled={isSavingDraft || isSending}
								icon={<PaperPlaneTiltIcon size={14} />}
							>
								{isSending ? t("Sending...", "正在发送…") : t("Send", "发送")}
							</Button>
						</div>
					</div>
				</div>
			</form>
		</div>
	);
}
