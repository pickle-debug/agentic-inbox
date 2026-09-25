// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Banner, Button, Dialog, Input, Text } from "@cloudflare/kumo";
import { FloppyDiskIcon, PaperPlaneTiltIcon } from "@phosphor-icons/react";
import { useParams } from "react-router";
import { useComposeForm } from "~/hooks/useComposeForm";
import ComposeAttachments from "./ComposeAttachments";
import ContactRecipientInput from "./ContactRecipientInput";
import RichTextEditor from "./RichTextEditor";
import { useUIStore } from "~/hooks/useUIStore";
import { useI18n } from "~/hooks/useI18n";

export default function ComposeEmail() {
	const { t } = useI18n();
	const { mailboxId, folder } = useParams<{
		mailboxId: string;
		folder: string;
	}>();

	const { isComposeModalOpen, closeComposeModal } = useUIStore();

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
	} = useComposeForm(mailboxId, folder);

	return (
		<Dialog.Root
			open={isComposeModalOpen}
			onOpenChange={(open) => !open && !isSending && closeComposeModal()}
		>
			<Dialog size="lg" className="p-6 max-h-[85vh] overflow-y-auto">
				<Dialog.Title className="text-lg font-semibold mb-5">
					{formTitle}
				</Dialog.Title>
				<form
					onSubmit={(e) => handleSend(e, closeComposeModal)}
					onDragEnterCapture={handleAttachmentDragEnter}
					onDragOverCapture={handleAttachmentDragOver}
					onDragLeaveCapture={handleAttachmentDragLeave}
					onDropCapture={handleAttachmentDrop}
					className="space-y-4"
				>
					{error && <Banner variant="error" text={error} />}
					<div className="flex items-center gap-2">
						<div className="flex-1 min-w-0">
							<ContactRecipientInput
								label={t("To", "收件人")}
								accessibleLabel={t("Recipients", "收件人")}
								value={to}
								onChange={setTo}
								disabled={isSending || isSavingDraft}
								required
							/>
						</div>
						{!showCcBcc && (
							<button
								type="button"
								onClick={() => setShowCcBcc(true)}
								className="shrink-0 text-xs text-kumo-link hover:text-kumo-link-hover font-medium mt-5"
							>
								{t("CC / BCC", "抄送 / 密送")}
							</button>
						)}
					</div>
					{showCcBcc && (
						<ContactRecipientInput
							label={t("CC", "抄送")}
							accessibleLabel={t("CC", "抄送")}
							value={cc}
							onChange={setCc}
							disabled={isSending || isSavingDraft}
						/>
					)}
					{showCcBcc && (
						<ContactRecipientInput
							label={t("BCC", "密送")}
							accessibleLabel={t("BCC", "密送")}
							value={bcc}
							onChange={setBcc}
							disabled={isSending || isSavingDraft}
						/>
					)}
					<Input
						label={t("Subject", "主题")}
						type="text"
						placeholder={t("Email subject", "邮件主题")}
						size="sm"
						value={subject}
						onChange={(e) => setSubject(e.target.value)}
						required
					/>
					<div>
						<Text size="sm" DANGEROUS_className="font-medium mb-1.5 block">
							{t("Message", "正文")}
						</Text>
						<RichTextEditor value={body} onChange={setBody} />
					</div>
					<ComposeAttachments
						attachments={attachments}
						isDragging={isDraggingAttachments}
						disabled={isSavingDraft || isSending}
						onAddFiles={addAttachments}
						onRemove={removeAttachment}
					/>
					<div className="flex justify-between items-center pt-2">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={closeComposeModal}
							disabled={isSending}
						>
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
				</form>
			</Dialog>
		</Dialog.Root>
	);
}
