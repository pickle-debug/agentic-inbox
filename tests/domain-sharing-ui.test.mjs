import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {readFile, readdir} from 'node:fs/promises';

const bundle = await build({stdin: {resolveDir: process.cwd(), loader: 'tsx', contents: `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter, Routes, Route} from 'react-router';
import {Toasty, TooltipProvider} from '@cloudflare/kumo';
import {I18nProvider} from './app/hooks/useI18n';
import {useUIStore} from './app/hooks/useUIStore';
import Home from './app/routes/home';
import Domain from './app/routes/domain';
import Mailbox from './app/routes/mailbox';
import MailboxIndex from './app/routes/mailbox-index';
import EmailList from './app/routes/email-list';
import Settings from './app/routes/system-settings';
import MailboxSettings from './app/routes/settings';
import SystemHeader from './app/components/SystemHeader';
import {canAccessMailbox} from './shared/access';
import api from './app/services/api';
// Mailboxes have no rules of their own: private reading comes from the system-wide sender policy.
const boxes = ['hr@zaku.net', 'jobs@zaku.net', 'hello@other.net'].map(email => ({id: email, email, name: email, settings: {}}));
let identity;
let policy = {mode: 'listed', domains: ['other.net', 'zaku.net'], autoCreate: false};
let keys = [];
let systemSettings = {autoDraftRepliesEnabled: false, agentSystemPrompt: '', unreadBadgeStyle: 'count', privacy: {enabled: true, domains: ['example.org']}};
export const actions = [];
api.getSession = async () => identity;
api.listMailboxes = async () => boxes.filter(box => canAccessMailbox(identity, box.email));
api.getConfig = async () => ({domains: identity.role === 'share' ? [identity.scope === 'domain' ? identity.target : identity.target.split('@')[1]] : [...new Set([...policy.domains, ...boxes.map(box => box.email.split('@')[1])])], emailAddresses: [], acceptAll: policy.mode === 'all', unreadBadgeStyle: systemSettings.unreadBadgeStyle, privacy: systemSettings.privacy ?? null});
api.getMailbox = async id => boxes.find(box => box.id === id);
api.listFolders = async () => ['inbox', 'sent', 'draft', 'archive', 'trash'].map(id => ({id, name: id, unreadCount: id === 'inbox' ? 1 : 0}));
const inboxes = Object.fromEntries(boxes.map((box, boxIndex) => [box.id, Array.from({length: boxIndex === 0 ? 2 : 1}, (_,index) => ({id: 'message-' + boxIndex + '-' + index, subject: index ? 'Magic link sign-in' : boxIndex === 0 ? 'Welcome to the team' : 'Interview schedule', sender: 'sender@example.org', recipient: box.id, date: '2026-11-20T00:00:00Z', read: false, starred: false, body: '<p>Hello reader</p><a href="https://login.example.test/magic?token=fixture">Sign in</a>', attachments: []}))]));
api.listMailboxSummaries = async () => boxes.filter(box => canAccessMailbox(identity, box.email)).map(box => ({...box, unreadCount: inboxes[box.id].filter(mail => !mail.read).length, latestDate: inboxes[box.id].at(-1)?.date, latestSubject: inboxes[box.id].at(-1)?.subject}));
api.listEmails = async (id, params) => ({emails: params.folder === 'inbox' ? inboxes[id] : [], totalCount: params.folder === 'inbox' ? inboxes[id].length : 0});
api.getEmail = async (mailboxId, id) => inboxes[mailboxId].find(mail => mail.id === id);
api.getThread = async () => [];
api.updateEmail = async (mailboxId, id, data) => {actions.push(['update', mailboxId, id, data]); const mail = inboxes[mailboxId].find(mail => mail.id === id); Object.assign(mail, data); return mail;};
api.markThreadRead = async (...args) => {actions.push(['mark', ...args]); return {};};
export function deliver(mailboxId) {
 inboxes[mailboxId].push({id: 'arrival-' + inboxes[mailboxId].length, subject: 'New arrival', sender: 'sender@example.org', recipient: mailboxId, date: '2026-11-20T01:00:00Z', read: false, starred: false, body: '<p>New mail</p>', attachments: []});
 client.invalidateQueries({queryKey: ['mailbox-summaries']});
 client.invalidateQueries({queryKey: ['emails', mailboxId]});
}
api.getSystemSettings = async () => systemSettings;
api.updateSystemSettings = async input => {systemSettings = input; actions.push(['system', input]); return input;};
export function setBadgeStyle(style) {systemSettings = {...systemSettings, unreadBadgeStyle: style};}
api.getReception = async () => policy;
api.updateReception = async input => {policy = input; actions.push(['reception', input]); return input;};
api.listShares = async () => keys;
api.createShare = async input => {const key = {...input, id: 'key-' + keys.length, created: Date.now(), expires: Date.now() + input.days * 86400000}; keys = [...keys, key]; actions.push(['share', input]); return {...key, token: 'f'.repeat(64)};};
api.revokeShare = async id => {keys = keys.filter(key => key.id !== id); actions.push(['revoke', id]);};
let client;
const root = createRoot(document.getElementById('root'));
let generation = 0;
export function mount(role = 'admin', permission = 'read', path = '/') {
 identity = role === 'admin' ? {role, email: 'admin@example.test', expires: Date.now() + 1000000} : {role: 'share', scope: role === 'share-mailbox' ? 'mailbox' : 'domain', target: role === 'share-mailbox' ? 'hr@zaku.net' : 'zaku.net', email: role === 'share-mailbox' ? 'hr@zaku.net' : 'zaku.net', permission, expires: Date.now() + 1000000, keyId: 'fixture'};
 client?.clear(); client = new QueryClient({defaultOptions: {queries: {retry: false, staleTime: Infinity}}});
 client.setQueryData(['session'], identity);
 useUIStore.setState({isAgentPanelOpen: false, selectedEmailId: null, isComposing: false});
 root.render(<I18nProvider key={++generation} initialLocale="zh"><QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><TooltipProvider><Toasty><SystemHeader/><Routes><Route path="/" element={<Home/>}/><Route path="/domain/:domain" element={<Domain/>}/><Route path="/settings" element={<Settings/>}/><Route path="/mailbox/:mailboxId" element={<Mailbox/>}><Route index element={<MailboxIndex/>}/><Route path="emails/:folder" element={<EmailList/>}/><Route path="settings" element={<MailboxSettings/>}/></Route></Routes></Toasty></TooltipProvider></MemoryRouter></QueryClientProvider></I18nProvider>);
}
`}, write: false, bundle: true, format: 'iife', globalName: 'domainProbe', platform: 'browser', tsconfig: 'tsconfig.cloudflare.json', define: {'process.env.NODE_ENV': '"production"'}});
let browser;
try {
	browser = await chromium.launch({headless: true, ...(process.env.PRIVACY_TEST_BROWSER ? {executablePath: process.env.PRIVACY_TEST_BROWSER} : {})});
	const context = await browser.newContext({viewport: {width: 1280, height: 900}});
	await context.route('**/*', route => route.abort());
	await context.route('https://inbox.example.test/', route => route.fulfill({contentType: 'text/html', body: '<!doctype html><html><body><div id="root"></div></body></html>'}));
	const page = await context.newPage();
	const errors = [];
	page.on('pageerror', err => errors.push(err.message));
	page.on('dialog', dialog => dialog.accept());
	await page.goto('https://inbox.example.test/');
	// Use the production CSS when available so local screenshots reflect the actual layout.
	const css = (await readdir('build/client/assets')).find(name => /^root-.*\.css$/.test(name));
	if (css) await page.addStyleTag({content: await readFile('build/client/assets/' + css, 'utf8')});
	await page.addScriptTag({content: bundle.outputFiles[0].text});
	await page.evaluate(() => domainProbe.mount('admin', 'read', '/?domain=zaku.net&overview=1'));
	await page.getByRole('navigation', {name: '域名列表'}).waitFor();
	await page.getByRole('navigation', {name: '域名列表'}).getByRole('button', {name: /zaku\.net/}).click();
	await page.getByRole('link').filter({hasText: 'hr@zaku.net'}).waitFor();
	assert.equal(await page.getByRole('link').filter({hasText: 'hello@other.net'}).count(), 0);
	await page.getByRole('textbox', {name: '搜索邮箱'}).fill('jobs');
	assert.equal(await page.getByRole('link').filter({hasText: 'hr@zaku.net'}).count(), 0);
	await page.getByRole('textbox', {name: '搜索邮箱'}).fill('');
	await page.screenshot({path: '/tmp/inbox-domain-groups.png', fullPage: true});
	await page.getByRole('button', {name: '分享域名组', exact: true}).click();
	await page.getByRole('textbox', {name: '凭证备注'}).fill('Team read-only');
	await page.getByRole('button', {name: '生成分享链接'}).click();
	await page.getByRole('textbox', {name: '分享链接', exact: true}).waitFor();
	const link = new URL(await page.getByRole('textbox', {name: '分享链接', exact: true}).inputValue());
	assert.equal(link.searchParams.get('domain'), 'zaku.net'); assert.equal(link.searchParams.get('token'), 'f'.repeat(64));
	await page.screenshot({path: '/tmp/inbox-domain-share.png', fullPage: true});
	await page.getByRole('button', {name: '撤销', exact: true}).click();
	await page.waitForFunction(() => domainProbe.actions.some(action => action[0] === 'revoke'));
	await page.getByRole('button', {name: '关闭', exact: true}).click();
	await page.getByRole('button', {name: '分享邮箱 hr@zaku.net', exact: true}).click();
	await page.getByRole('textbox', {name: '凭证备注'}).fill('Mailbox writer');
	await page.getByRole('combobox', {name: '权限', exact: true}).selectOption('write');
	await page.getByRole('button', {name: '生成分享链接'}).click();
	await page.getByRole('textbox', {name: '分享链接', exact: true}).waitFor();
	assert.equal(new URL(await page.getByRole('textbox', {name: '分享链接', exact: true}).inputValue()).searchParams.get('mailbox'), 'hr@zaku.net');
	await page.getByRole('button', {name: '关闭', exact: true}).click();
	await page.getByRole('link', {name: '配置接收域名'}).click();
	await page.getByRole('combobox', {name: '接收范围'}).selectOption('all');
	await page.getByRole('checkbox', {name: /首封邮件到达时自动创建邮箱/}).check();
	await page.getByRole('textbox', {name: '域名名单', exact: true}).fill('zaku.net\nnew.net');
	await page.getByRole('button', {name: '保存收信策略'}).click();
	await page.getByRole('status').filter({hasText: '收信策略已保存'}).waitFor();
	assert.deepEqual(await page.evaluate(() => domainProbe.actions.find(action => action[0] === 'reception')[1]), {mode: 'all', domains: ['zaku.net', 'new.net'], autoCreate: true});
	// Enter a domain once: mailboxes, folders, messages and the reader share one persistent shell.
	await page.evaluate(() => domainProbe.mount('admin', 'read', '/domain/zaku.net'));
	const rail = page.getByRole('complementary', {name: '域名邮箱列表'});
	const folders = page.getByRole('complementary', {name: '邮箱文件夹'});
	const mailArea = page.locator('[aria-label="邮件列表与阅读区"]');
	await rail.waitFor();
	await mailArea.getByText('Welcome to the team', {exact: true}).waitFor();
	assert.equal(await rail.getByRole('link').filter({hasText: 'jobs@zaku.net'}).count(), 1);
	// The current domain is the switcher itself, and red dots belong to mailboxes only.
	const domainSwitch = rail.getByRole('combobox', {name: '切换域名'});
	assert.equal(await domainSwitch.inputValue(), 'zaku.net');
	assert.deepEqual(await domainSwitch.locator('option').allTextContents(), ['new.net', 'other.net', 'zaku.net'], 'domain options carry no unread marks');
	assert.equal(await rail.locator('[aria-label^="zaku.net："], [aria-label^="其他域名"]').count(), 0, 'no domain-level badges in the workspace');
	assert.equal(await folders.locator('[aria-label*="封未读邮件"]').count(), 0, 'folder counts stay plain, without red dots');
	assert.equal(await rail.getByRole('combobox', {name: '未读提示样式'}).count(), 0, 'the alert style is configured only in System settings');
	assert.equal(await rail.getByRole('link', {name: '域名管理'}).count(), 0, 'domain management is reached from the top logo');
	const railOrder = () => rail.getByRole('navigation', {name: '此域名下的邮箱'}).getByRole('link').evaluateAll(links => links.map(link => link.getAttribute('title')));
	assert.deepEqual(await railOrder(), ['hr@zaku.net', 'jobs@zaku.net'], 'mailboxes without newer mail keep alphabetical order');
	await mailArea.getByText('Welcome to the team', {exact: true}).click();
	await page.getByRole('region', {name: '邮件隐私阅读'}).waitFor();
	assert.equal(await page.locator('iframe').count(), 0, 'the system sender policy protects mailboxes that never set rules');
	await rail.getByRole('img', {name: 'hr@zaku.net：1 封未读邮件', exact: true}).waitFor();
	assert.equal(await rail.isVisible(), true, 'mailbox rail must remain visible while a message is open');
	const columns = await page.evaluate(() => {
	 const rect = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
	 return {rail: rect('aside[aria-label="域名邮箱列表"]'), folders: rect('aside[aria-label="邮箱文件夹"]'), reader: rect('section[aria-label="邮件隐私阅读"]')};
	});
	assert.ok(Math.abs(columns.folders.left - columns.rail.right) < 2, 'the folder column sits between mailboxes and messages');
	assert.ok(columns.reader.left - columns.folders.right >= 300, 'the message list sits between folders and the reader');
	assert.ok(columns.reader.width >= 400, 'the reader stays readable at 1280px');
	await page.screenshot({path: '/tmp/inbox-four-columns.png', fullPage: true});
	await rail.getByRole('link').filter({hasText: 'jobs@zaku.net'}).click();
	await mailArea.getByText('Interview schedule', {exact: true}).waitFor();
	assert.equal(await page.getByRole('region', {name: '邮件隐私阅读'}).count(), 0, 'switching mailboxes must clear the old message');
	await folders.getByRole('link', {name: '已发送'}).click();
	await page.getByText('暂无已发送邮件', {exact: true}).waitFor();
	await folders.getByRole('link', {name: /收件箱/}).click();
	await mailArea.getByText('Interview schedule', {exact: true}).waitFor();
	// The unread alert style is a system setting: saved once by the administrator, used for everyone.
	await page.evaluate(() => domainProbe.mount('admin', 'read', '/settings'));
	await page.getByRole('radio', {name: '仅红点', exact: true}).check();
	await page.getByRole('button', {name: '保存更改'}).click();
	await page.getByText('设置已保存！', {exact: true}).waitFor();
	assert.equal(await page.evaluate(() => domainProbe.actions.findLast(action => action[0] === 'system')[1].unreadBadgeStyle), 'dot');
	await page.evaluate(() => domainProbe.mount('admin', 'read', '/mailbox/jobs%40zaku.net/emails/inbox'));
	await rail.getByRole('img', {name: 'jobs@zaku.net：1 封未读邮件', exact: true}).waitFor();
	assert.equal(await rail.getByRole('img', {name: 'jobs@zaku.net：1 封未读邮件', exact: true}).textContent(), '');
	await page.evaluate(() => domainProbe.deliver('jobs@zaku.net'));
	await rail.getByRole('img', {name: 'jobs@zaku.net：2 封未读邮件', exact: true}).waitFor();
	assert.equal(await rail.getByRole('img', {name: 'jobs@zaku.net：2 封未读邮件', exact: true}).textContent(), '');
	assert.deepEqual(await railOrder(), ['jobs@zaku.net', 'hr@zaku.net'], 'newest mail must move its mailbox to the top');
	// Pages without the inline composer (mailbox settings) open the compose dialog from the folder column.
	await page.evaluate(() => domainProbe.mount('admin', 'read', '/mailbox/hr%40zaku.net/settings'));
	await folders.getByRole('button', {name: '写邮件', exact: true}).click();
	await page.getByRole('dialog', {name: '新邮件'}).waitFor();
	await page.getByRole('dialog', {name: '新邮件'}).getByRole('button', {name: '放弃', exact: true}).click();
	await page.getByRole('dialog', {name: '新邮件'}).waitFor({state: 'detached'});
	// Below 1184px: both navigation columns plus either the list or the reader, never a squeezed fourth column.
	await page.setViewportSize({width: 900, height: 900});
	await page.evaluate(() => domainProbe.mount('admin', 'read', '/mailbox/hr%40zaku.net/emails/inbox'));
	await mailArea.getByText('Magic link sign-in', {exact: true}).click();
	await page.getByRole('region', {name: '邮件隐私阅读'}).waitFor();
	const tablet = await page.evaluate(() => ({
	 list: document.querySelector('[aria-label="邮件列表与阅读区"]').firstElementChild.getBoundingClientRect().width,
	 foldersRight: document.querySelector('aside[aria-label="邮箱文件夹"]').getBoundingClientRect().right,
	 reader: document.querySelector('section[aria-label="邮件隐私阅读"]').getBoundingClientRect().toJSON(),
	}));
	assert.equal(tablet.list, 0, 'the message list hides while reading on narrower screens');
	assert.ok(tablet.reader.left - tablet.foldersRight < 2 && tablet.reader.width >= 400, 'the reader takes the space beside the folders');
	await page.getByRole('button', {name: '返回列表'}).click();
	await mailArea.getByText('Magic link sign-in', {exact: true}).waitFor();
	assert.equal(await page.getByRole('region', {name: '邮件隐私阅读'}).count(), 0);
	await page.setViewportSize({width: 1280, height: 900});
	// Fresh document for visitor checks: resets mail fixtures and recorded actions.
	await page.reload();
	if (css) await page.addStyleTag({content: await readFile('build/client/assets/' + css, 'utf8')});
	await page.addScriptTag({content: bundle.outputFiles[0].text});
	await page.evaluate(() => domainProbe.setBadgeStyle('dot'));
	await page.evaluate(() => domainProbe.mount('share', 'read'));
	await rail.waitFor();
	await mailArea.getByText('Welcome to the team', {exact: true}).waitFor();
	assert.equal(await rail.getByRole('img', {name: 'hr@zaku.net：2 封未读邮件', exact: true}).textContent(), '', "visitors see the administrator's dot-only style");
	assert.equal(await rail.getByRole('combobox', {name: '切换域名'}).count(), 0, 'a single shared domain needs no switcher');
	assert.equal(await rail.getByRole('heading', {name: 'zaku.net'}).count(), 1);
	assert.equal(await rail.getByRole('link').filter({hasText: 'hello@other.net'}).count(), 0);
	assert.equal(await page.getByRole('button', {name: '写邮件', exact: true}).count(), 0);
	await mailArea.getByText('Welcome to the team', {exact: true}).click();
	await page.getByRole('region', {name: '邮件隐私阅读'}).waitFor();
	assert.equal(await page.getByRole('button', {name: '回复', exact: true}).count(), 0);
	assert.equal(await page.evaluate(() => domainProbe.actions.filter(action => action[0] === 'update' || action[0] === 'mark').length), 0, 'read-only viewing and badge refresh must not mark mail read');
	assert.equal(await page.getByRole('button', {name: '切换助手面板'}).isDisabled(), true);
	await page.evaluate(() => domainProbe.deliver('jobs@zaku.net'));
	await rail.getByRole('img', {name: 'jobs@zaku.net：2 封未读邮件', exact: true}).waitFor();
	await page.evaluate(() => domainProbe.mount('share-mailbox', 'read'));
	await rail.waitFor();
	await mailArea.getByText('Welcome to the team', {exact: true}).waitFor();
	assert.equal(await rail.getByRole('link').filter({hasText: 'jobs@zaku.net'}).count(), 0, 'single-mailbox sharing must expose no siblings');
	assert.equal(await rail.getByRole('link').filter({hasText: 'hr@zaku.net'}).count(), 1);
	await page.setViewportSize({width: 390, height: 844});
	await page.getByRole('button', {name: '切换侧边栏'}).click();
	await page.waitForTimeout(300);
	const phone = await page.evaluate(() => ({rail: document.querySelector('aside[aria-label="域名邮箱列表"]').getBoundingClientRect().toJSON(), folders: document.querySelector('aside[aria-label="邮箱文件夹"]').getBoundingClientRect().toJSON()}));
	assert.ok(phone.rail.left >= 0 && phone.folders.right <= 390 && phone.folders.left >= phone.rail.right - 1, 'phones show mailboxes and folders side by side from the menu button');
	assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'mobile navigation must fit the viewport');
	await page.screenshot({path: '/tmp/inbox-four-columns-mobile.png', fullPage: true});
	assert.deepEqual(errors, []);
	console.log('PASS: persistent four-column workspace (mailboxes, folders, messages, reader), two-pane narrow reading, mailbox-only red dots, merged domain switcher, newest-first mailbox order, system-wide unread alert style for visitors, compose from non-list pages, mailbox switching, folder navigation, direct domain/single-mailbox shares, new arrivals, read-only isolation, sharing controls and mobile layout.');
} finally {await browser?.close();}
