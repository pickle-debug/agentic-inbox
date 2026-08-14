// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button } from "@cloudflare/kumo";
import { FileIcon, PaperclipIcon, XIcon } from "@phosphor-icons/react";
import { useRef } from "react";
import type { ComposeAttachment } from "~/lib/compose-attachments";
import { formatBytes } from "~/lib/utils";

interface ComposeAttachmentsProps {
	attachments: ComposeAttachment[];
	isDragging: boolean;
	disabled?: boolean;
	onAddFiles: (files: FileList | File[]) => void;
	onRemove: (id: string) => void;
}

export default function ComposeAttachments({
	attachments,
	isDragging,
	disabled = false,
	onAddFiles,
	onRemove,
}: ComposeAttachmentsProps) {
	const inputRef = useRef<HTMLInputElement>(null);

	return (
		<div
			className={`rounded-md border px-3 py-2.5 transition-colors ${
				isDragging
					? "border-kumo-link bg-kumo-tint ring-1 ring-kumo-link/30"
					: "border-kumo-line bg-kumo-base"
			}`}
		>
			<input
				ref={inputRef}
				type="file"
				multiple
				className="hidden"
				disabled={disabled}
				onChange={(event) => {
					if (event.target.files?.length) onAddFiles(event.target.files);
					event.target.value = "";
				}}
			/>

			<div className="flex flex-wrap items-center gap-2">
				<Button
					type="button"
					variant="secondary"
					size="sm"
					icon={<PaperclipIcon size={14} />}
					disabled={disabled}
					onClick={() => inputRef.current?.click()}
				>
					Attach files
				</Button>
				<span className={`text-xs ${isDragging ? "text-kumo-link font-medium" : "text-kumo-subtle"}`}>
					{isDragging ? "Drop files here" : "or drag and drop files anywhere in this message"}
				</span>
			</div>

			{attachments.length > 0 && (
				<div className="mt-2.5 flex flex-wrap gap-2">
					{attachments.map((attachment) => (
						<div
							key={attachment.id}
							className="flex min-w-0 max-w-full items-center gap-2 rounded-md bg-kumo-recessed px-2.5 py-1.5 text-sm"
						>
							<FileIcon size={15} className="shrink-0 text-kumo-subtle" />
							<span className="max-w-[220px] truncate font-medium text-kumo-default">
								{attachment.filename}
							</span>
							<span className="shrink-0 text-xs text-kumo-subtle">
								{formatBytes(attachment.size)}
							</span>
							<button
								type="button"
								className="shrink-0 rounded p-0.5 text-kumo-subtle hover:bg-kumo-fill hover:text-kumo-default disabled:opacity-50"
								disabled={disabled}
								onClick={() => onRemove(attachment.id)}
								aria-label={`Remove ${attachment.filename}`}
							>
								<XIcon size={13} />
							</button>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
