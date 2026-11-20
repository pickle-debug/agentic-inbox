import { useEffect, useState } from "react";
import { useI18n } from "~/hooks/useI18n";
import { extractEmailContent } from "~/lib/email-content";

export default function EmailContent({ body }: { body: string }) {
	const { t } = useI18n();
	const [content, setContent] = useState<(ReturnType<typeof extractEmailContent> & { body: string }) | null>(null);
	const [notice, setNotice] = useState("");
	useEffect(() => {
		setContent({ ...extractEmailContent(body), body });
		setNotice("");
	}, [body]);
	const current = content?.body === body ? content : null;

	return (
		<section className="space-y-4 p-4 md:p-6" aria-label={t("Private email reader", "邮件隐私阅读")}>
			<p className="text-xs text-kumo-subtle">
				{t("Privacy protection is on. Email images and external content are not loaded. Links are extracted without visiting them.", "隐私保护已开启：不加载邮件图片及外部内容，仅提取链接，不自动访问。")}
			</p>
			{current ? <>
				<h3 className="text-sm font-medium text-kumo-default">{t("Extracted links (including sign-in links)", "提取的链接（含登录链接）")}</h3>
				<p className="text-xs text-kumo-subtle">{t("Copy the link to use it. Visiting it can identify this email and your network address; wrapped links are kept intact.", "复制需要的链接后使用。实际访问仍可能记录这封邮件及出口 IP；保留原始跳转链接，不自动解包。")}</p>
				{current.links.length === 0 ? <p className="text-sm text-kumo-subtle">{t("No HTTP or HTTPS links found.", "未发现 HTTP 或 HTTPS 链接。")}</p> :
					<ul className="space-y-3">
						{current.links.map((link, index) => <li key={link.url} className="space-y-1.5">
							<div className="flex items-center justify-between gap-3">
								<span className="text-sm text-kumo-default break-all">{link.label || t(`Link ${index + 1}`, `链接 ${index + 1}`)}</span>
								<button type="button" className="shrink-0 rounded border border-kumo-line px-2 py-1 text-xs hover:bg-kumo-tint" aria-label={t(`Copy link ${index + 1}`, `复制链接 ${index + 1}`)} onClick={async () => {
									try { await navigator.clipboard.writeText(link.url); setNotice(t("Link copied.", "链接已复制。")); }
									catch { setNotice(t("Unable to copy. Select the link below and copy it manually.", "无法自动复制，请选中下方链接手动复制。")); }
								}}>{t("Copy", "复制")}</button>
							</div>
							<textarea readOnly rows={2} value={link.url} aria-label={t(`Link ${index + 1} URL`, `链接 ${index + 1} 地址`)} className="block w-full resize-y rounded border border-kumo-line bg-kumo-base p-2 font-mono text-xs text-kumo-default" />
						</li>)}
					</ul>}
				<p role="status" className="text-xs text-kumo-subtle">{notice}</p>
				<details className="text-sm text-kumo-default" open>
					<summary className="cursor-pointer font-medium">{t("Plain text", "纯文本正文")}</summary>
					<pre className="mt-3 whitespace-pre-wrap break-words font-sans">{current.text || t("No text content.", "没有文本内容。")}</pre>
				</details>
			</> : <p role="status" className="text-sm text-kumo-subtle">{t("Extracting email content…", "正在提取邮件内容…")}</p>}
			<details className="text-sm text-kumo-default">
				<summary className="cursor-pointer font-medium">{t("Original body source (not rendered)", "原始正文源码（不渲染）")}</summary>
				<pre className="mt-3 whitespace-pre-wrap break-all font-mono text-xs">{body}</pre>
			</details>
		</section>
	);
}
