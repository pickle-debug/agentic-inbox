import { Button, Dialog, Input } from "@cloudflare/kumo";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { ShareInput } from "../../shared/access";
import { useI18n } from "~/hooks/useI18n";
import api from "~/services/api";

export default function ShareDialog({
	scope,
	target,
	onClose,
}: {
	scope: "domain" | "mailbox";
	target: string;
	onClose: () => void;
}) {
	const { t, dateLocale } = useI18n();
	const keys = useQuery({ queryKey: ["shares"], queryFn: api.listShares });
	const [label, setLabel] = useState("");
	const [permission, setPermission] = useState<ShareInput["permission"]>("read");
	const [days, setDays] = useState(30);
	const [url, setUrl] = useState("");
	const [notice, setNotice] = useState("");
	const [busy, setBusy] = useState(false);
	const permissionLabel = (value: string) =>
		value === "manage"
			? t("Manage", "管理（含删除邮件）")
			: value === "write"
				? t("Read / write", "读写")
				: t("Read only", "只读");
	return (
		<Dialog.Root
			open
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<Dialog size="lg" className="max-h-[90dvh] overflow-y-auto p-6">
				<Dialog.Title>
					{t("Share access", "分享访问")} · {target}
				</Dialog.Title>
				<Dialog.Description className="mt-2 text-xs text-kumo-subtle">
					{scope === "domain"
						? t(
								"Includes every current and future mailbox in this exact domain.",
								"包含该精确域名下现有及未来创建的所有邮箱。",
							)
						: t("Includes only this mailbox.", "仅包含此邮箱。")}
				</Dialog.Description>
				<form
					className="mt-5 space-y-4"
					onSubmit={async (event) => {
						event.preventDefault();
						if (busy) return;
						setBusy(true);
						setNotice("");
						setUrl("");
						try {
							const result = await api.createShare({ scope, target, permission, label, days });
							const link = new URL("/", window.location.origin);
							link.searchParams.set(scope, target);
							link.searchParams.set("token", result.token);
							setUrl(link.href);
							await keys.refetch();
						} catch (err) {
							setNotice(
								err instanceof Error ? err.message : t("Failed to create link.", "创建链接失败。"),
							);
						} finally {
							setBusy(false);
						}
					}}
				>
					<fieldset disabled={busy} className="space-y-3">
						<Input
							label={t("Label", "凭证备注")}
							value={label}
							maxLength={100}
							required
							onChange={(event) => setLabel(event.target.value)}
							placeholder={t("For a teammate", "例如：给同事使用")}
						/>
						<div className="grid grid-cols-2 gap-3">
							<label className="text-sm">
								{t("Permission", "权限")}
								<select
									className="mt-1 block w-full rounded-lg border border-kumo-line bg-kumo-base p-2"
									value={permission}
									onChange={(event) =>
										setPermission(event.target.value as ShareInput["permission"])
									}
								>
									{["read", "write", "manage"].map((value) => (
										<option key={value} value={value}>
											{permissionLabel(value)}
										</option>
									))}
								</select>
							</label>
							<label className="text-sm">
								{t("Expires in", "有效期")}
								<select
									className="mt-1 block w-full rounded-lg border border-kumo-line bg-kumo-base p-2"
									value={days}
									onChange={(event) => setDays(Number(event.target.value))}
								>
									{[1, 7, 30, 90, 365].map((value) => (
										<option key={value} value={value}>
											{t(`${value} days`, `${value} 天`)}
										</option>
									))}
								</select>
							</label>
						</div>
						<p className="text-xs text-kumo-subtle">
							{t(
								"Read: view and download. Write: also send, draft and organize. Manage: also delete messages and change mailbox settings. Keys, passwords, mailbox creation/deletion and system settings remain administrator-only. Shared visitors cannot use AI tools.",
								"只读可查看和下载；读写可发送、保存草稿和整理；管理再增加删除邮件及修改邮箱设置。凭证、密码、建箱/删箱和系统设置仍仅管理员可操作。分享访客不能使用 AI 工具。",
							)}
						</p>
					</fieldset>
					<Button type="submit" size="sm" variant="primary" disabled={busy || !label.trim()}>
						{t("Create sharing link", "生成分享链接")}
					</Button>
				</form>
				{url && (
					<div className="mt-4 space-y-2">
						<p className="text-xs text-kumo-subtle">
							{t(
								"Save this link now; its secret is shown only once. Anyone holding it can access this scope until expiry or revocation.",
								"请现在保存链接，密钥仅展示一次。持有链接的人可在有效期内访问授权范围，撤销后立即失效。",
							)}
						</p>
						<textarea
							aria-label={t("Sharing link", "分享链接")}
							readOnly
							rows={3}
							value={url}
							className="w-full rounded-lg border border-kumo-line p-2 font-mono text-xs"
						/>
						<Button
							size="sm"
							variant="secondary"
							onClick={async () => {
								try {
									await navigator.clipboard.writeText(url);
									setNotice(t("Copied.", "已复制。"));
								} catch {
									setNotice(t("Please select and copy the link manually.", "请选中链接手动复制。"));
								}
							}}
						>
							{t("Copy link", "复制链接")}
						</Button>
					</div>
				)}
				{notice && (
					<p role="status" className="mt-3 text-sm">
						{notice}
					</p>
				)}
				<div className="mt-5 max-h-56 overflow-y-auto border-t border-kumo-line pt-3">
					<h3 className="mb-2 text-sm font-medium">{t("Existing credentials", "已有凭证")}</h3>
					{keys.error ? (
						<p role="alert" className="text-sm text-kumo-error">
							{keys.error.message}
						</p>
					) : keys.isPending ? (
						<p role="status">{t("Loading…", "正在加载…")}</p>
					) : (
						keys.data
							.filter((key) => key.scope === scope && key.target === target)
							.map((key) => (
								<div
									key={key.id}
									className="flex items-center justify-between gap-3 border-b border-kumo-line py-2 text-sm"
								>
									<div>
										<div>
											{key.label} · {permissionLabel(key.permission)}
										</div>
										<div className="text-xs text-kumo-subtle">
											{new Date(key.expires).toLocaleString(dateLocale)}
											{key.expires <= Date.now() ? t(" · Expired", " · 已过期") : ""}
										</div>
									</div>
									<Button
										size="xs"
										variant="destructive"
										disabled={busy}
										onClick={async () => {
											if (
												!window.confirm(
													t(
														"Revoke this credential and all its active sessions?",
														"撤销此凭证及其所有已登录会话？",
													),
												)
											)
												return;
											setBusy(true);
											try {
												await api.revokeShare(key.id);
												await keys.refetch();
												setUrl("");
											} catch (err) {
												setNotice(
													err instanceof Error
														? err.message
														: t("Revocation failed.", "撤销失败。"),
												);
											} finally {
												setBusy(false);
											}
										}}
									>
										{t("Revoke", "撤销")}
									</Button>
								</div>
							))
					)}
				</div>
				<div className="mt-4 flex justify-end">
					<Button size="sm" variant="secondary" onClick={onClose}>
						{t("Close", "关闭")}
					</Button>
				</div>
			</Dialog>
		</Dialog.Root>
	);
}
