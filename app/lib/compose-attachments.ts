// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import type { Attachment } from "~/types";

export interface ComposeAttachment {
	id: string;
	filename: string;
	type: string;
	size: number;
	file?: File;
	content?: string;
	stored?: {
		emailId: string;
		attachmentId: string;
	};
}

export interface OutgoingAttachment {
	content: string;
	filename: string;
	type: string;
	disposition: "attachment";
}

export function composeAttachmentFromFile(file: File): ComposeAttachment {
	return {
		id: crypto.randomUUID(),
		filename: file.name || "untitled",
		type: file.type || "application/octet-stream",
		size: file.size,
		file,
	};
}

export function composeAttachmentFromStored(
	emailId: string,
	attachment: Attachment,
): ComposeAttachment {
	return {
		id: `stored-${emailId}-${attachment.id}`,
		filename: attachment.filename,
		type: attachment.mimetype || "application/octet-stream",
		size: attachment.size,
		stored: {
			emailId,
			attachmentId: attachment.id,
		},
	};
}

export function blobToBase64(
	blob: Blob,
	t: (english: string, chinese: string) => string = (english) => english,
): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(reader.error || new Error(t("Failed to read attachment.", "附件读取失败。")));
		reader.onload = () => {
			const result = reader.result;
			if (typeof result !== "string") {
				reject(new Error(t("Failed to encode attachment.", "附件编码失败。")));
				return;
			}
			const commaIndex = result.indexOf(",");
			resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
		};
		reader.readAsDataURL(blob);
	});
}

export async function serializeComposeAttachments(
	attachments: ComposeAttachment[],
	loadStored: (emailId: string, attachmentId: string) => Promise<Blob>,
	t: (english: string, chinese: string) => string = (english) => english,
): Promise<OutgoingAttachment[]> {
	return Promise.all(
		attachments.map(async (attachment) => {
			let content = attachment.content;
			if (content === undefined && attachment.file) {
				content = await blobToBase64(attachment.file, t);
			}
			if (content === undefined && attachment.stored) {
				const blob = await loadStored(
					attachment.stored.emailId,
					attachment.stored.attachmentId,
				);
				content = await blobToBase64(blob, t);
			}
			if (content === undefined) {
				throw new Error(t(`Failed to read attachment: ${attachment.filename}`, `附件读取失败：${attachment.filename}`));
			}

			return {
				content,
				filename: attachment.filename,
				type: attachment.type || "application/octet-stream",
				disposition: "attachment" as const,
			};
		}),
	);
}

export function materializeComposeAttachments(
	attachments: ComposeAttachment[],
	outgoing: OutgoingAttachment[],
): ComposeAttachment[] {
	return attachments.map((attachment, index) => ({
		...attachment,
		file: undefined,
		stored: undefined,
		content: outgoing[index]?.content,
	}));
}
