import { Button, Input, Loader } from "@cloudflare/kumo";
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Link } from "react-router";
import { MailboxPasswordDialog } from "~/components/MailboxPasswordDialog";
import { useI18n } from "~/hooks/useI18n";
import api from "~/services/api";

export default function MailboxPasswordSettings({ mailboxId, email }: { mailboxId: string; email: string }) {
	const { t, message } = useI18n();
	const session = useQuery({ queryKey: ["session"], queryFn: api.getSession });
	const [open, setOpen] = useState(false);
	const [currentPassword, setCurrentPassword] = useState("");
	const [password, setPassword] = useState("");
	const [confirmation, setConfirmation] = useState("");
	const [error, setError] = useState("");
	const [saving, setSaving] = useState(false);
	const changePassword = async (event: FormEvent) => {
		event.preventDefault();
		if (saving) return;
		setError("");
		if (password.length < 12 || password.length > 128) { setError(t("Password must be 12 to 128 characters.", "密码长度必须在 12 到 128 个字符之间。")); return; }
		if (password !== confirmation) { setError(t("Passwords do not match.", "两次输入的密码不一致。")); return; }
		setSaving(true);
		try {
			await api.changeMailboxPassword(mailboxId, currentPassword, password);
			window.location.replace("/login");
		} catch (err) {
			setError(err instanceof Error ? message(err.message) : t("Failed to change password. Please try again.", "修改密码失败，请重试。"));
			setSaving(false);
		}
	};
	return <section className="rounded-lg border border-kumo-line bg-kumo-base p-5">
		<h2 className="mb-3 text-sm font-medium">{t("Password", "密码")}</h2>
		{session.isPending ? <div role="status" aria-label={t("Loading login status", "加载登录状态")}><Loader /></div> : session.isError ? <div className="space-y-3">
			<p role="alert" className="text-sm text-kumo-error">{t("Unable to load login status. Please try again.", "无法读取登录状态，请重试。")}</p>
			<Button size="sm" onClick={() => void session.refetch()} disabled={session.isFetching}>{t("Retry", "重试")}</Button>
		</div> : session.data.role === "admin" ? <>
			<p className="mb-3 text-xs text-kumo-subtle">{t("Manage separate password login for this mailbox.", "管理此邮箱的独立密码登录。")}</p>
			<Button size="sm" variant="secondary" onClick={() => setOpen(true)}>{t("Manage password login", "管理密码登录")}</Button>
			<MailboxPasswordDialog mailboxId={mailboxId} email={email} open={open} onOpenChange={setOpen} />
		</> : session.data.email === mailboxId ? <form onSubmit={changePassword} className="space-y-4">
			<p className="text-xs text-kumo-subtle">{t("Enter your current password to change it. You will need to sign in again after saving.", "输入当前密码以修改密码。保存后需要重新登录。")}</p>
			{error && <div className="space-y-2"><p role="alert" className="text-sm text-kumo-error">{error}</p><Link to="/login" className="text-sm text-kumo-link underline">{t("Back to sign in", "返回登录")}</Link></div>}
			<fieldset disabled={saving} className="space-y-3">
				<Input label={t("Current password", "当前密码")} type="password" autoComplete="current-password" maxLength={128} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
				<Input label={t("New password", "新密码")} type="password" autoComplete="new-password" minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} required />
				<Input label={t("Confirm password", "确认密码")} type="password" autoComplete="new-password" minLength={12} maxLength={128} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required />
			</fieldset>
			<Button type="submit" variant="secondary" size="sm" loading={saving} disabled={saving || !currentPassword || !password || !confirmation}>{t("Change password", "修改密码")}</Button>
		</form> : <p className="text-sm text-kumo-error">{t("You cannot change this mailbox's password.", "您无权修改此邮箱的密码。")}</p>}
	</section>;
}
