import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const bundle = await build({
	stdin: { contents: `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from './app/hooks/useI18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router';
import { Toasty, TooltipProvider } from '@cloudflare/kumo';
import SettingsRoute from './app/routes/settings';
import SystemSettingsRoute from './app/routes/system-settings';
import api from './app/services/api';
import EmailContent from './app/components/EmailContent';
import SingleMessageView from './app/components/email-panel/SingleMessageView';
import ThreadMessage from './app/components/email-panel/ThreadMessage';
export { extractEmailContent as extract } from './app/lib/email-content';
export { htmlToPlainText as toText } from './app/lib/utils';
const root = createRoot(document.getElementById('root'));
export function mount(body, view = 'single', locale = 'zh', options = {}) {
 const { sender = 'sender@example.test', privacySettings = { enabled: true, domains: ['example.test'] }, settingsLoaded = true } = options;
 const email = { id: 'fixture', sender, recipient: 'reader@example.test', date: '2026-11-20T00:00:00Z', body, attachments: [] };
 const policy = { privacySettings, settingsLoaded };
 root.render(<I18nProvider key={locale} initialLocale={locale}>{view === 'single' ? <SingleMessageView email={email} {...policy} /> : <ThreadMessage email={email} {...policy} isLast isExpanded onToggleExpand={() => {}} />}</I18nProvider>);
}
let settingsMailbox = { id: 'reader@example.test', email: 'reader@example.test', name: 'Reader', settings: { privacy: {enabled: false, domains: []} } };
export const saves = [];
api.getMailbox = async () => settingsMailbox;
api.updateMailbox = async (mailboxId, settings) => { settingsMailbox = {...settingsMailbox, settings: {...settingsMailbox.settings, ...settings}}; return settingsMailbox; };
// System settings own the sender policy; every API the page touches is mocked so the test stays offline.
let systemSettings = { autoDraftRepliesEnabled: false, agentSystemPrompt: '', unreadBadgeStyle: 'count', privacy: { enabled: false, domains: [] } };
let systemPrivacySaved = true;
api.getSystemSettings = async () => systemSettings;
api.updateSystemSettings = async settings => { saves.push(settings); systemSettings = settings; systemPrivacySaved = true; return settings; };
api.getConfig = async () => ({ domains: [], emailAddresses: [], unreadBadgeStyle: systemSettings.unreadBadgeStyle, privacy: systemPrivacySaved ? systemSettings.privacy : null });
api.getReception = async () => ({ mode: 'listed', domains: ['example.test'], autoCreate: false });
export function offerLegacyRules(domains) { systemSettings = { ...systemSettings, privacy: { enabled: true, domains } }; systemPrivacySaved = false; }
export function mountSystemSettings() {
 const client = new QueryClient({defaultOptions: {queries: {retry: false, staleTime: Infinity}}});
 client.setQueryData(['session'], {role: 'admin', email: 'admin@example.test'});
 root.render(<I18nProvider key={'system-' + Math.random()} initialLocale="zh"><QueryClientProvider client={client}><MemoryRouter initialEntries={['/settings']}><TooltipProvider><Toasty><Routes><Route path="/settings" element={<SystemSettingsRoute/>}/></Routes></Toasty></TooltipProvider></MemoryRouter></QueryClientProvider></I18nProvider>);
}
export function mountSettings() {
 const client = new QueryClient({defaultOptions: {queries: {retry: false, staleTime: Infinity}}});
 client.setQueryData(['session'], {role: 'admin', email: 'admin@example.test'});
 client.setQueryData(['mailboxes', settingsMailbox.id], settingsMailbox);
 root.render(<I18nProvider key="settings" initialLocale="zh"><QueryClientProvider client={client}><MemoryRouter initialEntries={['/mailbox/reader@example.test/settings']}><TooltipProvider><Toasty><Routes><Route path="/mailbox/:mailboxId/settings" element={<SettingsRoute/>}/></Routes></Toasty></TooltipProvider></MemoryRouter></QueryClientProvider></I18nProvider>);
}
export function ssr(body) { return renderToStaticMarkup(<I18nProvider initialLocale="zh"><EmailContent body={body}/></I18nProvider>); }
`, resolveDir: process.cwd(), loader: 'tsx' },
	write: false, bundle: true, format: 'iife', globalName: 'privacyProbe', platform: 'browser',
	tsconfig: 'tsconfig.cloudflare.json', define: { 'process.env.NODE_ENV': '"production"' },
});

let browser;
try {
	browser = await chromium.launch({ headless: true, ...(process.env.PRIVACY_TEST_BROWSER ? { executablePath: process.env.PRIVACY_TEST_BROWSER } : {}) });
	const context = await browser.newContext();
	const page = await context.newPage();
	const requests = [];
	const errors = [];
	const consoleErrors = [];
	page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
	context.on('request', request => requests.push(request.url()));
	page.on('pageerror', error => errors.push(error.message));
	await context.route('**/*', route => route.abort());
	await context.route('https://inbox.example.test/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><div id="root"></div></body></html>' }));
	await page.goto('https://inbox.example.test/');
	requests.length = 0;
	await page.addScriptTag({ content: bundle.outputFiles[0].text });
	await page.evaluate(() => {
		window.__copied = [];
		Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__copied.push(value); } } });
		customElements.define('privacy-trap', class extends HTMLElement { constructor() { super(); window.__executed = true; } });
	});

	const magic = 'https://login.example.test/magic?token=a%2fb%2B%3D&next=%2Faccount#secret';
	const wrapped = 'https://click.example.test/redirect?url=https%3A%2F%2Flogin.example.test%2Fmagic%3Ftoken%3Dabc&sig=unchanged';
	const hostile = `<!doctype html><html><head>
<base href="https://tracker.example.test/">
<meta http-equiv="refresh" content="0;url=https://tracker.example.test/refresh">
<link rel="stylesheet" href="https://tracker.example.test/style.css">
<link rel="preload" as="image" href="https://tracker.example.test/preload">
<style>@import 'https://tracker.example.test/import'; @font-face {font-family:track;src:url('https://tracker.example.test/font')} body {background:url('https://tracker.example.test/background')}</style>
</head><body onload="window.__executed=true">
<script>window.__executed=true;fetch('https://tracker.example.test/script')</script>
<privacy-trap></privacy-trap>
<img width="1" height="1" src="https://tracker.example.test/pixel" srcset="https://tracker.example.test/retina 2x" onerror="window.__executed=true">
<picture><source srcset="https://tracker.example.test/source"><img src="//tracker.example.test/protocol-relative"></picture>
<iframe src="https://tracker.example.test/frame"></iframe>
<object data="https://tracker.example.test/object"></object><embed src="https://tracker.example.test/embed">
<video src="https://tracker.example.test/video" poster="https://tracker.example.test/poster" autoplay></video>
<audio src="https://tracker.example.test/audio" autoplay></audio>
<form action="https://tracker.example.test/form"><input type="image" src="https://tracker.example.test/input"></form>
<svg><image href="https://tracker.example.test/svg" /></svg>
<div style="background:url(https://tracker.example.test/inline)">Hello &amp; welcome<br>Second line</div>
<p><a ping="https://tracker.example.test/ping" href="${magic.replaceAll('&', '&amp;')}">Sign in</a></p>
<a href='${magic.replaceAll('&', '&#38;')}'>Duplicate</a>
<a href="${wrapped.replaceAll('&', '&amp;')}">Wrapped login</a>
<a href="javascript:window.__executed=true">Invalid</a><a href="data:text/html,attack">Invalid</a>
<a href="/relative">Relative</a><a href="//tracker.example.test/relative">Relative</a>
<a href="https://user:password@tracker.example.test/">Credentials</a>
<a href="https://">Malformed</a><a href="https://login.example.test/&#10;bad">Control</a>
<template><img src="https://tracker.example.test/template"></template>
<p>Fallback: https://login.example.test/fallback?token=z%2fZ&amp;keep=yes#fragment</p>
</body></html>`;
	const extracted = await page.evaluate(body => privacyProbe.extract(body), hostile);
	assert.deepEqual(extracted.links.map(link => link.url), [magic, wrapped, 'https://login.example.test/fallback?token=z%2fZ&keep=yes#fragment']);
	assert.equal(extracted.links[0].label, 'Sign in');
	assert.match(extracted.text, /Hello & welcome\nSecond line/);
	assert.doesNotMatch(extracted.text, /@font-face|__executed|@import/);
	assert.equal(await page.evaluate(body => privacyProbe.toText(body), hostile), extracted.text);
	assert.deepEqual(await page.evaluate(() => privacyProbe.extract('')), { text: '', links: [] });
	assert.deepEqual(await page.evaluate(() => privacyProbe.extract('Hello\nhttps://login.example.test/?token=abc#end').links), [{ url: 'https://login.example.test/?token=abc#end', label: '' }]);
	assert.equal(await page.evaluate(() => privacyProbe.extract('<div><a href="https://login.example.test/?x=1&#38;y=%2f">Login').links[0].url), 'https://login.example.test/?x=1&y=%2f');
	assert.equal(await page.evaluate(() => privacyProbe.extract('2 < 3 &amp; 4 > 1').text), '2 < 3 & 4 > 1');
	const ssr = await page.evaluate(body => privacyProbe.ssr(body), hostile);
	assert.doesNotMatch(ssr, /<(?:img|iframe|script|link|meta|svg|form|video|audio|privacy-trap)\b/i);
	assert.match(ssr, /&lt;img/);

	for (const view of ['single', 'thread']) {
		await page.evaluate(({ body, view }) => privacyProbe.mount(body, view), { body: hostile, view });
		await page.getByRole('textbox', { name: '链接 1 地址', exact: true }).waitFor();
		assert.equal(await page.getByRole('textbox', { name: '链接 1 地址', exact: true }).inputValue(), magic);
		assert.equal(await page.locator('textarea[readonly]').count(), 3);
		await page.getByRole('button', { name: '复制链接 1', exact: true }).click();
		await page.getByRole('status').filter({ hasText: '链接已复制' }).waitFor();
		assert.equal(await page.evaluate(() => window.__copied.at(-1)), magic);
		await page.getByText('原始正文源码（不渲染）', { exact: true }).click();
		assert.equal(await page.locator('details').last().locator('pre').textContent(), hostile);
		assert.equal(await page.locator('#root img, #root iframe, #root script, #root link, #root meta, #root svg image, #root form, #root video, #root audio, #root privacy-trap, #root a[href]').count(), 0);
		assert.equal(await page.getByRole('region', { name: '邮件隐私阅读' }).locator('svg').count(), 0);
	}
	await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error('Clipboard denied'); }; });
	await page.getByRole('button', { name: '复制链接 1', exact: true }).click();
	await page.getByRole('status').filter({ hasText: '无法自动复制' }).waitFor();
	await page.evaluate(() => privacyProbe.mount('<p>New message without links</p>', 'single'));
	await page.getByText('未发现 HTTP 或 HTTPS 链接。', { exact: true }).waitFor();
	assert.equal(await page.locator('textarea').count(), 0, 'changing emails must remove stale magic links');
	await page.evaluate(() => privacyProbe.mount('<a href="https://login.example.test/new">Login</a>', 'single', 'en'));
	await page.getByRole('textbox', { name: 'Link 1 URL', exact: true }).waitFor();
	await page.evaluate(body => privacyProbe.mount(body, 'single', 'zh', { settingsLoaded: false, privacySettings: { enabled: false, domains: [] } }), hostile);
	await page.getByRole('region', { name: '邮件隐私阅读' }).waitFor();
	assert.equal(await page.locator('iframe').count(), 0, 'do not render before settings load');
	await page.waitForTimeout(250);
	assert.equal(await page.evaluate(() => window.__executed), undefined);
	assert.deepEqual(requests, [], 'parsing, reading, source viewing and copying must make zero network requests');
	assert.deepEqual(errors, []);
	for (const view of ['single', 'thread']) {
		const pixel = `https://tracker.example.test/normal-${view}`;
		await page.evaluate(({ body, view }) => privacyProbe.mount(body, view, 'zh', { sender: 'sender@other.test' }), { body: `<p>Normal HTML</p><img src="${pixel}">`, view });
		await page.frameLocator('iframe').getByText('Normal HTML', { exact: true }).waitFor();
		await page.waitForFunction(url => document.querySelector('iframe')?.srcdoc.includes(url), pixel);
		await page.waitForTimeout(500);
		assert.ok(requests.includes(pixel), JSON.stringify({message: 'nonmatching senders must retain normal HTML/image behavior', requests, consoleErrors, html: await page.frameLocator('iframe').locator('body').innerHTML()}));
		await page.evaluate(({ body, view }) => privacyProbe.mount(body, view, 'zh', { sender: 'sender@sub.example.test' }), { body: hostile, view });
		await page.getByRole('textbox', { name: '链接 1 地址', exact: true }).waitFor();
		assert.equal(await page.locator('iframe').count(), 0, 'a matching sender in either view must switch back to private reading');
	}
	assert.equal(requests.length, 2, 'only explicitly tested nonmatching messages may load images');
	await page.evaluate(() => privacyProbe.mount('<p>Privacy disabled</p>', 'single', 'zh', { privacySettings: {enabled: false, domains: ['example.test']} }));
	await page.frameLocator('iframe').getByText('Privacy disabled', { exact: true }).waitFor();
	// Mailboxes no longer have their own rules; the settings page points to System settings.
	await page.evaluate(() => privacyProbe.mountSettings());
	await page.getByText('邮件隐私保护（指定发件人域名不渲染）已改为对所有邮箱统一配置：').waitFor();
	assert.equal(await page.getByRole('link', { name: '系统设置' }).getAttribute('href'), '/settings');
	assert.equal(await page.getByRole('checkbox', { name: '对指定发件人域名启用隐私阅读' }).count(), 0);
	// Before the system policy is saved, System settings offers the rules mailboxes used before.
	await page.evaluate(() => { privacyProbe.offerLegacyRules(['legacy.test']); privacyProbe.mountSystemSettings(); });
	await page.getByText('已预填各邮箱原来单独设置的域名，保存后对所有邮箱生效。').waitFor();
	assert.equal(await page.getByRole('textbox', { name: '发件人域名', exact: true }).inputValue(), 'legacy.test');
	await page.getByRole('textbox', { name: '发件人域名', exact: true }).fill('');
	const toggle = page.getByRole('checkbox', { name: '所有邮箱对以下发件人域名启用隐私阅读' });
	assert.equal(await toggle.isChecked(), true);
	await toggle.uncheck();
	await toggle.check();
	await page.getByRole('button', { name: '保存更改', exact: true }).click();
	await page.getByRole('alert').filter({ hasText: '请至少填写一个发件人域名' }).waitFor();
	assert.equal(await page.evaluate(() => privacyProbe.saves.length), 0);
	await page.getByRole('textbox', { name: '发件人域名', exact: true }).fill('EXAMPLE.TEST\nmail.example.org, example.test');
	await page.getByRole('button', { name: '保存更改', exact: true }).click();
	await page.waitForFunction(() => privacyProbe.saves.length === 1);
	assert.deepEqual(await page.evaluate(() => privacyProbe.saves[0].privacy), { enabled: true, domains: ['example.test', 'mail.example.org'] });
	await page.waitForFunction(() => document.getElementById('system-privacy-domains').value === 'example.test\nmail.example.org');
	await page.getByText('已预填各邮箱原来单独设置的域名，保存后对所有邮箱生效。').waitFor({ state: 'detached' });
	await toggle.uncheck();
	await page.getByRole('button', { name: '保存更改', exact: true }).click();
	await page.waitForFunction(() => privacyProbe.saves.length === 2);
	assert.deepEqual(await page.evaluate(() => privacyProbe.saves[1].privacy), { enabled: false, domains: ['example.test', 'mail.example.org'] });
	await page.evaluate(() => privacyProbe.mount('<p>Unmount settings</p>'));
	await page.getByRole('region', { name: '邮件隐私阅读' }).waitFor();
	await page.evaluate(() => privacyProbe.mountSystemSettings());
	await toggle.waitFor();
	assert.equal(await toggle.isChecked(), false);
	assert.equal(await page.getByRole('textbox', { name: '发件人域名', exact: true }).inputValue(), 'example.test\nmail.example.org');
	assert.deepEqual(errors, []);
	assert.equal(requests.length, 2);
	console.log('PASS: Chromium private reading makes ZERO external requests; exact magic tokens, copy/source, policy-loading protection, matched/subdomain/nonmatching/disabled rules in both reading views, normal HTML images, system-wide settings toggle (mailbox pages point there), old-rule pre-fill, validation, domain normalization, save/reload and retained disabled list.');
} finally {
	await browser?.close();
}
