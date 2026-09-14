import { Button, Input, Text } from "@cloudflare/kumo";
import { type FormEvent, useEffect, useState } from "react";
import api from "~/services/api";

export function meta() { return [{ title: "登录 · Agentic Inbox" }]; }

export default function LoginRoute() {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [adminLoginUrl, setAdminLoginUrl] = useState<string | null>(null);

	useEffect(() => { api.getLoginConfig().then((config) => setAdminLoginUrl(config.adminLoginUrl)).catch(() => {}); }, []);
	const submit = async (event: FormEvent) => {
		event.preventDefault();
		setError(null);
		setLoading(true);
		try {
			await api.login(email, password);
			window.location.href = "/";
		} catch (err) {
			setError(err instanceof Error ? err.message : "登录失败，请检查邮箱和密码。");
			setLoading(false);
		}
	};
	return <main className="min-h-screen bg-kumo-recessed flex items-center justify-center px-4 py-8">
		<section className="w-full max-w-md rounded-xl border border-kumo-line bg-kumo-base p-6 shadow-sm">
			<h1 className="text-xl font-bold text-kumo-default">登录邮箱</h1>
			<p className="mt-2 text-sm text-kumo-subtle">使用邮箱账号和密码访问该邮箱。</p>
			<form className="mt-6 space-y-4" onSubmit={submit}>
				{error && <div aria-live="polite"><Text variant="error" size="sm">{error}</Text></div>}
				<Input label="邮箱" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
				<Input label="密码" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
				<Button className="w-full" type="submit" variant="primary" loading={loading}>登录</Button>
			</form>
			{adminLoginUrl && <div className="mt-6 border-t border-kumo-line pt-5"><p className="text-sm text-kumo-subtle mb-3">管理员请使用 Cloudflare Access 邮箱验证登录。</p><Button className="w-full" variant="secondary" onClick={() => { window.location.href = adminLoginUrl; }}>管理员登录</Button></div>}
		</section>
	</main>;
}
