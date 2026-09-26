import { Button, Tooltip } from "@cloudflare/kumo";
import { EnvelopeIcon, GearSixIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "react-router";
import LanguageSelector from "~/components/LanguageSelector";
import { useI18n } from "~/hooks/useI18n";
import api from "~/services/api";

export default function SystemHeader() {
	const { t } = useI18n();
	const { pathname } = useLocation();
	const navigate = useNavigate();
	const isLogin = pathname === "/login" || pathname === "/login/";
	const isSettings = pathname.replace(/\/+$/, "") === "/settings";
	const { data: session } = useQuery({ queryKey: ["session"], queryFn: api.getSession, enabled: !isLogin });

	return (
		<header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-kumo-line bg-kumo-base px-4 md:px-6">
			<Link to={isLogin ? "/login" : "/"} aria-label={t("Agentic Inbox home", "Agentic Inbox 首页")} className="flex min-w-0 items-center gap-2 rounded text-sm font-semibold text-kumo-default no-underline focus-visible:outline-2 focus-visible:outline-kumo-ring">
				<EnvelopeIcon size={20} aria-hidden="true" className="shrink-0" />
				<span className="truncate">Agentic Inbox</span>
			</Link>
			<nav aria-label={t("System preferences", "系统偏好设置")} className="flex shrink-0 items-center gap-1">
				<LanguageSelector compact />
				{!isLogin && session?.role === "admin" && <Tooltip content={t("System settings", "系统设置")} side="bottom" asChild>
					<Button variant={isSettings ? "secondary" : "ghost"} shape="square" icon={<GearSixIcon size={20} aria-hidden="true" />} onClick={() => navigate("/settings")} aria-label={t("System settings", "系统设置")} aria-current={pathname === "/settings" ? "page" : undefined} />
				</Tooltip>}
			</nav>
		</header>
	);
}
