import { Button, Dialog, Input, Text } from "@cloudflare/kumo";
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import api from "~/services/api";
import { useI18n } from "~/hooks/useI18n";

type Props = {
	mailboxId: string;
	email: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

export function MailboxPasswordDialog({ mailboxId, email, open, onOpenChange }: Props) {
	const { t, message } = useI18n();
	const [password, setPassword] = useState("");
	const [confirmation, setConfirmation] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);
	const [isDisabling, setIsDisabling] = useState(false);
	const { data, isLoading, error: loadError, isFetching, refetch } = useQuery({
		queryKey: ["mailbox-login", mailboxId],
		queryFn: () => api.getMailboxLogin(mailboxId),
		enabled: open,
	});

	useEffect(() => {
		if (!open) {
			setPassword("");
			setConfirmation("");
			setError(null);
		}
	}, [open]);

	const handleSubmit = async (event: FormEvent) => {
		event.preventDefault();
		if (isSaving || isDisabling) return;
		setError(null);
		if (password.length < 12 || password.length > 128) {
			setError(t("Password must be 12 to 128 characters.", "密码长度必须在 12 到 128 个字符之间。"));
			return;
		}
		if (password !== confirmation) {
			setError(t("Passwords do not match.", "两次输入的密码不一致。"));
			return;
		}
		setIsSaving(true);
		try {
			await api.setMailboxPassword(mailboxId, password);
			setPassword("");
			setConfirmation("");
			await refetch();
		} catch (err) {
			setError(err instanceof Error ? err.message : t("Failed to set password. Please try again.", "设置密码失败，请重试。"));
		} finally {
			setIsSaving(false);
		}
	};

	const disable = async () => {
		if (isSaving || isDisabling) return;
		setError(null);
		setIsDisabling(true);
		try {
			await api.disableMailboxLogin(mailboxId);
			await refetch();
		} catch (err) {
			setError(err instanceof Error ? err.message : t("Failed to disable password login. Please try again.", "停用密码登录失败，请重试。"));
		} finally {
			setIsDisabling(false);
		}
	};

	const enabled = data?.enabled === true;
	const busy = isSaving || isDisabling;
	return (
		<Dialog.Root open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
			<Dialog size="sm" className="max-h-[90dvh] overflow-y-auto p-6">
				<Dialog.Title className="text-base font-semibold mb-2">{t("Mailbox password login", "邮箱密码登录")}</Dialog.Title>
				<Dialog.Description className="text-sm text-kumo-subtle mb-5">
					{t(`Set a separate login password for ${email}. This account can only access its own mailbox.`, `为 ${email} 设置独立登录密码。该账号登录后只能访问自己的邮箱。`)}
				</Dialog.Description>
				<div aria-live="polite" className="mb-4 text-sm">
					{error || loadError ? <Text variant="error" size="sm">{message(error || loadError!.message)}</Text> : isLoading ? t("Loading login status…", "正在读取登录状态…") : enabled ? t("Password login is enabled.", "密码登录已启用。") : t("Password login is not enabled.", "密码登录尚未启用。")}
				</div>
				{loadError && <Button size="sm" className="mb-4" disabled={isFetching} onClick={() => void refetch()}>{t("Retry", "重试")}</Button>}
				<form onSubmit={handleSubmit} className="space-y-4">
					<fieldset disabled={busy || isLoading || !!loadError} className="space-y-4">
					<Input label={enabled ? t("New password", "新密码") : t("Password", "密码")} type="password" autoComplete="new-password" minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} required />
					<Input label={t("Confirm password", "确认密码")} type="password" autoComplete="new-password" minLength={12} maxLength={128} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required />
					<div className="flex flex-wrap justify-between gap-2 pt-2">
						{enabled ? <Button type="button" variant="destructive" size="sm" loading={isDisabling} disabled={busy} onClick={disable}>{t("Disable password login", "停用密码登录")}</Button> : <span />}
						<div className="flex gap-2">
							<Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => onOpenChange(false)}>{t("Cancel", "取消")}</Button>
							<Button type="submit" variant="primary" size="sm" loading={isSaving} disabled={busy}>{enabled ? t("Reset password", "重设密码") : t("Set password", "设置密码")}</Button>
						</div>
					</div>
					</fieldset>
				</form>
			</Dialog>
		</Dialog.Root>
	);
}
