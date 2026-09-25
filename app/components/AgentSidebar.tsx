// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useQuery } from "@tanstack/react-query";
import api from "~/services/api";
import { Loader } from "@cloudflare/kumo";
import { PlugsIcon, RobotIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import MCPPanel from "./MCPPanel";
import { useI18n } from "~/hooks/useI18n";

function LazyAgentPanel() {
	const { t } = useI18n();
	const [AgentChat, setAgentChat] = useState<React.ComponentType | null>(
		null,
	);
	const [loadError, setLoadError] = useState<string | null>(null);

	useEffect(() => {
		import("~/components/AgentPanel").then((mod) => {
			setAgentChat(() => mod.default);
		}).catch((err) => {
			console.error("Failed to load AgentPanel:", err);
			setLoadError("Failed to load agent panel");
		});
	}, []);

	if (loadError) {
		return (
			<div className="flex items-center justify-center h-full">
				<span className="text-xs text-kumo-error">{t("Failed to load agent panel", "助手面板加载失败")}</span>
			</div>
		);
	}
	if (!AgentChat) {
		return (
			<div className="flex flex-col items-center justify-center h-full gap-2">
				<Loader size="base" />
				<span className="text-xs text-kumo-subtle">{t("Loading agent...", "正在加载助手…")}</span>
			</div>
		);
	}
	return <AgentChat />;
}

export default function AgentSidebar() {
	const { t } = useI18n();
	const { data: session } = useQuery({ queryKey: ["session"], queryFn: api.getSession });
	const [activeTab, setActiveTab] = useState<"agent" | "mcp">("agent");

	return (
		<div className="flex flex-col h-full">
			{/* Tab bar */}
			<div className="flex items-center border-b border-kumo-line shrink-0">
				<button
					type="button"
					onClick={() => setActiveTab("agent")}
					className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 bg-transparent cursor-pointer ${
						activeTab === "agent"
							? "border-kumo-brand text-kumo-default"
							: "border-transparent text-kumo-subtle hover:text-kumo-default"
					}`}
				>
					<RobotIcon size={14} weight={activeTab === "agent" ? "fill" : "regular"} />
					{t("Agent", "助手")}
				</button>
				{session?.role === "admin" && <button
					type="button"
					onClick={() => setActiveTab("mcp")}
					className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 bg-transparent cursor-pointer ${
						activeTab === "mcp"
							? "border-kumo-brand text-kumo-default"
							: "border-transparent text-kumo-subtle hover:text-kumo-default"
					}`}
				>
					<PlugsIcon size={14} weight={activeTab === "mcp" ? "fill" : "regular"} />
					MCP
				</button>}
			</div>

			{/* Tab content — keep agent mounted so chat isn't lost */}
			<div className="flex-1 min-h-0 overflow-hidden">
				<div className={activeTab === "agent" ? "h-full" : "hidden"}>
					<LazyAgentPanel />
				</div>
				{session?.role === "admin" && activeTab === "mcp" && <MCPPanel />}
			</div>
		</div>
	);
}
