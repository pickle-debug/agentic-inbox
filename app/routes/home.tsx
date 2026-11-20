import { Button, Dialog, Input, Loader } from "@cloudflare/kumo";
import {
	EnvelopeIcon,
	GlobeIcon,
	PlusIcon,
	ShareNetworkIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Navigate, Link, useSearchParams } from "react-router";
import { MailboxPasswordDialog } from "~/components/MailboxPasswordDialog";
import ShareDialog from "~/components/ShareDialog";
import { useMailboxes, useCreateMailbox, useDeleteMailbox } from "~/queries/mailboxes";
import { useI18n } from "~/hooks/useI18n";
import api from "~/services/api";

export function meta() {
	return [{ title: "Agentic Inbox" }];
}

export default function HomeRoute() {
	const { t, message } = useI18n();
	const session = useQuery({ queryKey: ["session"], queryFn: api.getSession });
	const boxes = useMailboxes({ refetchInterval: 15000 });
	const config = useQuery({ queryKey: ["config"], queryFn: api.getConfig, refetchInterval: 15000 });
	const create = useCreateMailbox();
	const remove = useDeleteMailbox();
	const [params, setParams] = useSearchParams();
	const [search, setSearch] = useState("");
	const [createOpen, setCreateOpen] = useState(false);
	const [address, setAddress] = useState("");
	const [error, setError] = useState("");
	const [share, setShare] = useState<{ scope: "domain" | "mailbox"; target: string } | null>(null);
	const [password, setPassword] = useState<{ id: string; email: string } | null>(null);
	const identity = session.data;
	const admin = identity?.role === "admin";
	const domains = [
		...new Set([
			...(config.data?.domains ?? []),
			...(boxes.data ?? []).map((box) => box.email.split("@")[1]),
		]),
	].sort();
	const requested = params.get("domain");
	const selected = domains.includes(requested || "") ? requested! : domains[0] || "";
	const accounts = (boxes.data ?? [])
		.filter(
			(box) =>
				box.email.split("@")[1] === selected &&
				box.email.toLowerCase().includes(search.toLowerCase()),
		)
		.sort((a, b) => a.email.localeCompare(b.email));
	if (identity?.role === "mailbox" || (identity?.role === "share" && identity.scope === "mailbox"))
		return <Navigate to={`/mailbox/${encodeURIComponent(identity.email)}/emails/inbox`} replace />;
	const loadError = session.error || config.error || boxes.error;
	if (loadError)
		return (
			<main className="p-8 space-y-4">
				<p role="alert">{message(loadError.message)}</p>
				<Button
					onClick={() => {
						session.refetch();
						config.refetch();
						boxes.refetch();
					}}
				>
					{t("Retry", "重试")}
				</Button>
			</main>
		);
	if (!identity || !config.data || !boxes.data)
		return (
			<main className="flex justify-center p-16">
				<Loader />
			</main>
		);
	return (
		<main className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-10">
			<header className="mb-6 flex flex-wrap items-start justify-between gap-4">
				<div>
					<h1 className="text-2xl font-semibold">{t("Mailboxes", "邮箱")}</h1>
					<p className="mt-1 text-sm text-kumo-subtle">
						{admin ? t("Administrator", "管理员") : t("Shared access", "分享访问")} ·{" "}
						{identity.email}
						{identity.role === "share"
							? ` · ${identity.permission === "read" ? t("Read only", "只读") : identity.permission === "write" ? t("Read / write", "读写") : t("Manage", "管理")}`
							: ""}
					</p>
				</div>
				<div className="flex gap-2">
					{admin && (
						<Button
							size="sm"
							variant="primary"
							icon={<PlusIcon size={16} />}
							onClick={() => {
								setAddress(selected ? `@${selected}` : "");
								setError("");
								setCreateOpen(true);
							}}
						>
							{t("New mailbox", "新建邮箱")}
						</Button>
					)}
					<Button
						size="sm"
						variant="secondary"
						onClick={async () => {
							try {
								const result = await api.logout();
								window.location.replace(result.redirect);
							} catch (err) {
								setError(err instanceof Error ? err.message : t("Sign out failed", "退出失败"));
							}
						}}
					>
						{t("Sign out", "退出登录")}
					</Button>
				</div>
			</header>
			{error && !createOpen && (
				<p role="alert" className="mb-4 text-sm text-kumo-error">
					{message(error)}
				</p>
			)}
			<div className="grid overflow-hidden md:min-h-[480px] rounded-xl border border-kumo-line bg-kumo-base md:grid-cols-[240px_minmax(0,1fr)]">
				<nav
					aria-label={t("Domains", "域名列表")}
					className="border-b border-kumo-line bg-kumo-recessed p-3 md:border-b-0 md:border-r"
				>
					<div className="mb-3 px-2 text-xs font-medium text-kumo-subtle">
						{t(`${domains.length} domains`, `${domains.length} 个域名`)}
					</div>
					<div className="flex gap-1 overflow-x-auto md:flex-col md:overflow-x-visible">
						{domains.map((domain) => (
							<button
								key={domain}
								type="button"
								aria-current={selected === domain ? "true" : undefined}
								className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm ${selected === domain ? "bg-kumo-base font-semibold text-kumo-default shadow-sm" : "text-kumo-subtle hover:bg-kumo-tint"}`}
								onClick={() => {
									setParams({ domain });
									setSearch("");
								}}
							>
								<GlobeIcon size={16} />
								<span className="min-w-0 flex-1 truncate">{domain}</span>
								<span className="text-xs text-kumo-subtle">
									{boxes.data.filter((box) => box.email.split("@")[1] === domain).length}
								</span>
							</button>
						))}
					</div>
					{admin && (
						<Link
							to="/settings"
							className="mt-4 block rounded px-2 text-xs text-kumo-subtle underline"
						>
							{t("Configure receiving domains", "配置接收域名")}
						</Link>
					)}
				</nav>
				<section className="min-w-0">
					<div className="flex flex-wrap items-center justify-between gap-3 border-b border-kumo-line p-4">
						<div>
							<h2 className="font-semibold">{selected || t("No domains yet", "暂无域名")}</h2>
							<p className="mt-1 text-xs text-kumo-subtle">
								{t("Select a mailbox to read its messages.", "选择邮箱查看邮件。")}
							</p>
						</div>
						<div className="flex gap-2">
							{admin && selected && (
								<Button
									size="sm"
									variant="secondary"
									icon={<ShareNetworkIcon size={16} />}
									onClick={() => setShare({ scope: "domain", target: selected })}
								>
									{t("Share domain", "分享域名组")}
								</Button>
							)}
							<Button
								size="sm"
								variant="ghost"
								onClick={() => {
									boxes.refetch();
									config.refetch();
								}}
							>
								{t("Refresh", "刷新")}
							</Button>
						</div>
					</div>
					<div className="p-4">
						<Input
							aria-label={t("Search mailboxes", "搜索邮箱")}
							placeholder={t("Search mailboxes in this domain", "搜索此域名下的邮箱")}
							value={search}
							onChange={(event) => setSearch(event.target.value)}
						/>
					</div>
					<div className="divide-y divide-kumo-line">
						{accounts.map((account) => (
							<div
								key={account.id}
								className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-kumo-tint"
							>
								<Link
									to={`/mailbox/${encodeURIComponent(account.id)}/emails/inbox`}
									className="flex min-w-0 flex-1 items-center gap-3 text-kumo-default no-underline"
								>
									<span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-kumo-fill">
										<EnvelopeIcon size={18} />
									</span>
									<span className="min-w-0">
										<span className="block truncate text-sm font-medium">
											{account.email.split("@")[0]}
										</span>
										<span className="block truncate text-xs text-kumo-subtle">{account.email}</span>
									</span>
								</Link>
								{admin && (
									<div className="flex items-center gap-1">
										<Button
											size="sm"
											variant="ghost"
											onClick={() => setShare({ scope: "mailbox", target: account.email })}
											aria-label={t(`Share ${account.email}`, `分享邮箱 ${account.email}`)}
											icon={<ShareNetworkIcon size={16} />}
											shape="square"
										/>
										<Button size="sm" variant="ghost" onClick={() => setPassword(account)}>
											{t("Password login", "密码登录")}
										</Button>
										<Button
											size="sm"
											variant="ghost"
											shape="square"
											icon={<TrashIcon size={16} />}
											disabled={remove.isPending}
											aria-label={t(`Delete mailbox ${account.email}`, `删除邮箱 ${account.email}`)}
											onClick={async () => {
												if (
													!window.confirm(
														t(`Delete mailbox ${account.email}?`, `删除邮箱 ${account.email}？`),
													)
												)
													return;
												try {
													await remove.mutateAsync(account.id);
												} catch (err) {
													setError(
														err instanceof Error
															? err.message
															: t("Deletion failed.", "删除失败。"),
													);
												}
											}}
										/>
									</div>
								)}
							</div>
						))}
					</div>
					{accounts.length === 0 && (
						<div className="px-6 py-16 text-center">
							<EnvelopeIcon size={36} className="mx-auto text-kumo-subtle" />
							<p className="mt-3 text-sm">
								{search
									? t("No matching mailboxes.", "没有匹配的邮箱。")
									: t("No mailboxes in this domain yet.", "此域名下暂无邮箱。")}
							</p>
							{admin && (
								<p className="mt-2 text-xs text-kumo-subtle">
									{t(
										"Enable automatic creation in System settings to create mailboxes on first delivery.",
										"在系统设置开启自动建箱后，首封来信会自动创建邮箱。",
									)}
								</p>
							)}
						</div>
					)}
				</section>
			</div>
			<Dialog.Root open={createOpen} onOpenChange={setCreateOpen}>
				<Dialog size="sm">
					<Dialog.Title>{t("New mailbox", "新建邮箱")}</Dialog.Title>
					<form
						className="mt-4 space-y-4"
						onSubmit={async (event) => {
							event.preventDefault();
							if (create.isPending) return;
							setError("");
							try {
								await create.mutateAsync({
									email: address.trim().toLowerCase(),
									name: address.split("@")[0],
								});
								config.refetch();
								setCreateOpen(false);
							} catch (err) {
								setError(err instanceof Error ? err.message : t("Creation failed.", "创建失败。"));
							}
						}}
					>
						<Input
							label={t("Email", "邮箱")}
							type="email"
							value={address}
							onChange={(event) => setAddress(event.target.value)}
							required
						/>
						<p className="text-xs text-kumo-subtle">
							{config.data.acceptAll
								? t(
										"Any domain already routed to this Worker can be used.",
										"可使用任意已路由到此 Worker 的域名。",
									)
								: config.data.domains.join(", ")}
						</p>
						{error && (
							<p role="alert" className="text-sm text-kumo-error">
								{message(error)}
							</p>
						)}
						<div className="flex justify-end gap-2">
							<Button
								size="sm"
								variant="secondary"
								type="button"
								onClick={() => setCreateOpen(false)}
							>
								{t("Cancel", "取消")}
							</Button>
							<Button size="sm" type="submit" variant="primary" disabled={create.isPending}>
								{t("Create", "创建")}
							</Button>
						</div>
					</form>
				</Dialog>
			</Dialog.Root>
			{share && (
				<ShareDialog
					key={`${share.scope}:${share.target}`}
					{...share}
					onClose={() => setShare(null)}
				/>
			)}
			{password && (
				<MailboxPasswordDialog
					mailboxId={password.id}
					email={password.email}
					open
					onOpenChange={(open) => {
						if (!open) setPassword(null);
					}}
				/>
			)}
		</main>
	);
}
