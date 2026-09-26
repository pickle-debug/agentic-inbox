import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const dir = await mkdtemp(join(tmpdir(), 'inbox-settings-ui-'));
try {
	await build({
		stdin: { contents: `
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router';
import { Toasty, TooltipProvider } from '@cloudflare/kumo';
import { I18nProvider } from './app/hooks/useI18n';
import SystemHeader from './app/components/SystemHeader';
import Sidebar from './app/components/Sidebar';
import MailboxPasswordSettings from './app/components/MailboxPasswordSettings';
import SystemSettings from './app/routes/system-settings';
import api from './app/services/api';
export { api };
export function render(role, screen) {
 const client = new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}});
 const email = 'member@example.test';
 client.setQueryData(['session'],{role,email});
 client.setQueryData(['mailboxes',email],{id:email,email,name:'Member',settings:{}});
 client.setQueryData(['folders',email],[]);
 client.setQueryData(['system-settings'],{autoDraftRepliesEnabled:false,agentSystemPrompt:'Administrator-only prompt'});
 const path = screen === 'system' ? '/settings' : '/mailbox/'+email+'/settings';
 const page = screen === 'system' ? <SystemSettings/> : <><Sidebar/><MailboxPasswordSettings mailboxId={email} email={email}/></>;
 return renderToStaticMarkup(<I18nProvider initialLocale="zh"><QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><TooltipProvider><Toasty><SystemHeader/><Routes><Route path={screen==='system'?'/settings':'/mailbox/:mailboxId/settings'} element={page}/></Routes></Toasty></TooltipProvider></MemoryRouter></QueryClientProvider></I18nProvider>);
}
`, resolveDir: process.cwd(), loader: 'tsx' },
		outfile: join(dir, 'ui.cjs'), tsconfig: 'tsconfig.cloudflare.json', bundle: true, format: 'cjs', platform: 'node', define: { 'process.env.NODE_ENV': '"production"' },
	});
	const { render, api } = await import(pathToFileURL(join(dir, 'ui.cjs')));
	const admin = render('admin', 'mailbox');
	assert.match(admin, /aria-label="系统设置"/);
	assert.match(admin, /联系人/);
	assert.match(admin, /邮箱设置/);
	assert.match(admin, /管理密码登录/);
	const member = render('mailbox', 'mailbox');
	assert.doesNotMatch(member, /aria-label="系统设置"|>联系人</);
	assert.match(member, /邮箱设置/);
	assert.match(member, /当前密码/);
	assert.doesNotMatch(member, /管理密码登录/);
	assert.match(render('admin', 'system'), /Administrator-only prompt/);
	assert.doesNotMatch(render('mailbox', 'system'), /Administrator-only prompt|system-agent-prompt/);

	const originalFetch = globalThis.fetch;
	const originalWindow = globalThis.window;
	try {
		const redirects = [];
		globalThis.window = { location: { assign: url => redirects.push(url) } };
		globalThis.fetch = async () => Response.json({ error: '当前密码不正确。' }, { status: 401 });
		await assert.rejects(api.changeMailboxPassword('member@example.test', 'wrong-password', 'new-password-123'), /当前密码不正确/);
		assert.deepEqual(redirects, [], 'incorrect current password must remain an inline form error');
		await assert.rejects(api.getSession());
		assert.deepEqual(redirects, ['/login'], 'expired sessions still redirect normally');
	} finally {
		globalThis.fetch = originalFetch;
		if (originalWindow === undefined) delete globalThis.window;
		else globalThis.window = originalWindow;
	}
	console.log('PASS: administrator-only system settings and contacts, mailbox password controls, direct system-page denial and inline password errors.');
} finally { await rm(dir, { recursive: true, force: true }); }
