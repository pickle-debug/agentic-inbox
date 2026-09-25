// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button, Tooltip } from "@cloudflare/kumo";
import {
	CheckIcon,
	CopyIcon,
	PlugsIcon,
	WrenchIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { useParams } from "react-router";
import { useI18n } from "~/hooks/useI18n";

function CopyButton({ text }: { text: string }) {
	const { t } = useI18n();
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(text);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// Clipboard API unavailable or permission denied — ignore silently
		}
	};

	return (
		<Tooltip content={copied ? t("Copied!", "已复制！") : t("Copy", "复制")} asChild>
			<Button
				variant="ghost"
				shape="square"
				size="sm"
				icon={
					copied ? (
						<CheckIcon size={12} weight="bold" className="text-kumo-success" />
					) : (
						<CopyIcon size={12} />
					)
				}
				onClick={handleCopy}
				aria-label={t("Copy to clipboard", "复制到剪贴板")}
			/>
		</Tooltip>
	);
}

const TOOLS = [
	{ name: "list_mailboxes", desc: "List all mailboxes", zh: "列出所有邮箱" },
	{ name: "list_emails", desc: "List emails in a folder", zh: "列出文件夹内的邮件" },
	{ name: "get_email", desc: "Read a full email with body", zh: "读取邮件及完整正文" },
	{ name: "get_thread", desc: "Load a conversation thread", zh: "加载邮件会话" },
	{ name: "search_emails", desc: "Search emails by query", zh: "按条件搜索邮件" },
	{ name: "draft_reply", desc: "Draft a reply to an email", zh: "起草邮件回复" },
	{ name: "send_reply", desc: "Send a reply", zh: "发送回复" },
	{ name: "send_email", desc: "Send a new email", zh: "发送新邮件" },
	{ name: "mark_email_read", desc: "Mark email as read/unread", zh: "标记邮件已读或未读" },
	{ name: "move_email", desc: "Move email to a folder", zh: "将邮件移至文件夹" },
];

export default function MCPPanel() {
	const { t } = useI18n();
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const baseUrl =
		typeof window !== "undefined" ? window.location.origin : "https://your-app.workers.dev";
	const mcpUrl = `${baseUrl}/mcp`;

	return (
		<div className="flex flex-col h-full">
			{/* Content */}
			<div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
				{/* Intro */}
				<div className="space-y-2">
					<div className="flex items-center gap-2">
						<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-kumo-brand/10">
							<PlugsIcon
								size={20}
								weight="duotone"
								className="text-kumo-brand"
							/>
						</div>
						<div>
							<h3 className="text-sm font-semibold text-kumo-default">
								{t("Connect via MCP", "通过 MCP 连接")}
							</h3>
							<p className="text-xs text-kumo-subtle">
								{t("Model Context Protocol", "模型上下文协议")}
							</p>
						</div>
					</div>
					<p className="text-xs text-kumo-subtle leading-relaxed">
						{t("This email agent exposes an MCP server so AI coding assistants can manage your inbox directly — read emails, search, draft replies, and send messages using natural language.", "此邮件助手提供 MCP 服务，让 AI 编程助手通过自然语言直接管理收件箱：读取邮件、搜索、起草回复和发送邮件。")}
					</p>
				</div>

				{/* MCP URL */}
				<div className="space-y-1.5">
					<label className="text-xs font-medium text-kumo-strong block">
						{t("Server URL", "服务地址")}
					</label>
					<div className="relative group">
						<div className="absolute right-1.5 top-1/2 -translate-y-1/2">
							<CopyButton text={mcpUrl} />
						</div>
						<div className="bg-kumo-recessed text-kumo-default font-mono text-[11px] px-3 py-2.5 pr-10 rounded-lg border border-kumo-line break-all leading-relaxed">
							{mcpUrl}
						</div>
					</div>
				</div>

				{/* Available tools */}
				<div className="space-y-2">
					<h4 className="text-xs uppercase tracking-wider font-semibold text-kumo-subtle px-0.5">
						{t("Available Tools", "可用工具")}
					</h4>
					<div className="border border-kumo-line rounded-lg divide-y divide-kumo-line">
						{TOOLS.map((tool) => (
							<div
								key={tool.name}
								className="flex items-center gap-2.5 px-3 py-2"
							>
								<WrenchIcon
									size={12}
									weight="bold"
									className="text-kumo-brand shrink-0"
								/>
								<div className="min-w-0 flex-1">
									<span className="text-xs font-mono font-medium text-kumo-default">
										{tool.name}
									</span>
								</div>
								<span className="text-[11px] text-kumo-subtle shrink-0">
									{t(tool.desc, tool.zh)}
								</span>
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
