// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { usePermissions } from "~/hooks/usePermissions";
import type { ReactNode } from "react";
import ComposePanel from "~/components/ComposePanel";
import EmailPanel from "~/components/EmailPanel";
import { useI18n } from "~/hooks/useI18n";

interface MailboxSplitViewProps {
	selectedEmailId: string | null;
	isComposing: boolean;
	children: ReactNode;
}

export default function MailboxSplitView({
	selectedEmailId,
	isComposing,
	children,
}: MailboxSplitViewProps) {
	const {writable} = usePermissions();
	const {t} = useI18n();
	isComposing = isComposing && writable;
	const isPanelOpen = selectedEmailId !== null || isComposing;

	// Beside the mailbox and folder columns, list + reader only fit from the `split` breakpoint
	// (1184px, app/index.css). Narrower screens show either one, and the reader offers a back arrow.
	return (
		<div role="group" className="flex h-full" aria-label={t("Mail list and reader", "邮件列表与阅读区")}>
			<div
				className={`flex flex-col min-w-0 shrink-0 ${
					isPanelOpen
						? "hidden split:flex split:w-80 split:border-r split:border-kumo-line 2xl:w-[360px]"
						: "w-full split:w-80 split:border-r split:border-kumo-line 2xl:w-[360px]"
				}`}
			>
				{children}
			</div>
			{isPanelOpen && (
				<div className="flex-1 flex flex-col min-w-0 overflow-hidden w-full split:w-auto">
					{isComposing && !selectedEmailId ? (
						<ComposePanel />
					) : isComposing && selectedEmailId ? (
						<div className="flex flex-col h-full overflow-y-auto">
							<ComposePanel />
							<div className="border-t border-kumo-line">
								<EmailPanel emailId={selectedEmailId} />
							</div>
						</div>
					) : selectedEmailId ? (
						<EmailPanel emailId={selectedEmailId} />
					) : null}
				</div>
			)}
			{!isPanelOpen && <div className="hidden min-w-0 flex-1 items-center justify-center bg-kumo-base p-8 text-center text-sm text-kumo-subtle split:flex">{t("Select an email to read it here.", "选择一封邮件，在这里查看正文。")}</div>}
		</div>
	);
}
