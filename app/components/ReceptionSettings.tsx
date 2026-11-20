import { Button } from "@cloudflare/kumo";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { receptionSchema, type ReceptionSettings as Settings } from "../../shared/reception";
import { useI18n } from "~/hooks/useI18n";
import api from "~/services/api";

export default function ReceptionSettings() {
	const { t } = useI18n();
	const client = useQueryClient();
	const query = useQuery({ queryKey: ["reception"], queryFn: api.getReception });
	const [draft, setDraft] = useState<Settings | null>(null);
	const [domains, setDomains] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [notice, setNotice] = useState("");
	const value = draft ?? query.data;
	return (
		<section
			className="mt-8 rounded-xl border border-kumo-line bg-kumo-base p-5"
			aria-labelledby="reception-title"
		>
			<h2 id="reception-title" className="font-semibold">
				{t("Receiving domains", "收信域名与自动建箱")}
			</h2>
			<p className="mt-2 text-xs text-kumo-subtle">
				{t(
					"Cloudflare Email Routing must still deliver each domain to this Worker. These settings control which deliveries the application stores.",
					"各域名仍需通过 Cloudflare Email Routing 投递到此 Worker。这里控制应用接收哪些域名，无需再修改 Worker 变量。",
				)}
			</p>
			{query.error ? (
				<>
					<p role="alert" className="mt-3 text-sm text-kumo-error">
						{query.error.message}
					</p>
					<Button size="sm" onClick={() => query.refetch()}>
						{t("Retry", "重试")}
					</Button>
				</>
			) : !value ? (
				<p role="status" className="mt-3 text-sm">
					{t("Loading…", "正在加载…")}
				</p>
			) : (
				<form
					className="mt-4 space-y-4"
					onSubmit={async (event) => {
						event.preventDefault();
						if (busy) return;
						const parsed = receptionSchema.safeParse({
							...value,
							domains: (domains ?? value.domains.join("\n")).split(/[\s,，;；]+/).filter(Boolean),
						});
						if (!parsed.success) {
							setNotice(parsed.error.issues[0].message);
							return;
						}
						setBusy(true);
						setNotice("");
						try {
							const saved = await api.updateReception(parsed.data);
							client.setQueryData(["reception"], saved);
							client.invalidateQueries({ queryKey: ["config"] });
							setDraft(null);
							setDomains(null);
							setNotice(t("Receiving settings saved.", "收信策略已保存。"));
						} catch (err) {
							setNotice(err instanceof Error ? err.message : t("Save failed.", "保存失败。"));
						} finally {
							setBusy(false);
						}
					}}
				>
					<fieldset disabled={busy} className="space-y-4">
						<label className="block text-sm">
							{t("Reception policy", "接收范围")}
							<select
								className="mt-2 block w-full rounded-lg border border-kumo-line bg-kumo-base p-2"
								value={value.mode}
								onChange={(event) =>
									setDraft({ ...value, mode: event.target.value as Settings["mode"] })
								}
							>
								<option value="listed">{t("Only listed domains", "仅接收名单中的域名")}</option>
								<option value="all">
									{t("All domains routed to this Worker", "接收所有已路由到此 Worker 的域名")}
								</option>
							</select>
						</label>
						<label className="block text-sm">
							{t("Domain list", "域名名单")}
							<textarea
								className="mt-2 block w-full rounded-lg border border-kumo-line bg-kumo-recessed p-3 font-mono text-sm"
								rows={4}
								value={domains ?? value.domains.join("\n")}
								onChange={(event) => setDomains(event.target.value)}
								placeholder="zaku.net"
							/>
						</label>
						<p className="text-xs text-kumo-subtle">
							{t(
								"One domain per line. Exact matches only; add subdomains separately. In all-domains mode, this list also lets you create empty groups and share them before mail arrives.",
								"每行一个域名，精确匹配；子域名请单独添加。全接收模式下，名单还可用于提前创建空域名组并生成分享链接。",
							)}
						</p>
						<label className="flex items-start gap-3 text-sm">
							<input
								type="checkbox"
								className="mt-1"
								checked={value.autoCreate}
								onChange={(event) => setDraft({ ...value, autoCreate: event.target.checked })}
							/>
							<span>
								{t(
									"Create a mailbox automatically when its first email arrives",
									"首封邮件到达时自动创建邮箱",
								)}
								<span className="mt-1 block text-xs text-kumo-subtle">
									{t(
										"For example: mail to hr@zaku.net creates the zaku.net group and hr mailbox. The existing EMAIL_ADDRESSES allowlist still applies when non-empty.",
										"例如 hr@zaku.net 的首封邮件会建立 zaku.net 分组及 hr 邮箱。EMAIL_ADDRESSES 若非空，仍限制具体收件地址。",
									)}
								</span>
							</span>
						</label>
						<p className="text-xs text-kumo-subtle">
							{t(
								"Automatic creation stores mail for previously unknown addresses and uses your Worker/R2 quota. Deleted mailboxes stay blocked until an administrator explicitly recreates them.",
								"自动建箱会保存未知地址的来信并使用 Worker/R2 配额。管理员已删除的邮箱不会因来信自动重建，需手动重新创建。",
							)}
						</p>
					</fieldset>
					{notice && (
						<p role="status" className="text-sm">
							{notice}
						</p>
					)}
					<Button type="submit" size="sm" variant="primary" disabled={busy}>
						{t("Save reception policy", "保存收信策略")}
					</Button>
				</form>
			)}
		</section>
	);
}
