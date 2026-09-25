import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const dir = await mkdtemp(join(tmpdir(), 'inbox-i18n-'));
try {
	await build({ entryPoints: ['app/lib/i18n.ts', 'shared/dates.ts'], outdir: dir, bundle: true, format: 'esm', platform: 'node', outExtension: { '.js': '.mjs' } });
	const { getRequestLocale, languageCookie, translateMessage } = await import(pathToFileURL(join(dir, 'app/lib/i18n.mjs')));
	const { formatListDate, formatDetailDate, formatShortDate, formatQuotedDate } = await import(pathToFileURL(join(dir, 'shared/dates.mjs')));
	const requestLocale = (cookie, acceptLanguage) => getRequestLocale(new Headers({ ...(cookie ? { Cookie: cookie } : {}), ...(acceptLanguage ? { 'Accept-Language': acceptLanguage } : {}) }));
	assert.equal(requestLocale(), 'en');
	assert.equal(requestLocale(null, 'zh-CN,zh;q=0.9,en;q=0.8'), 'zh');
	assert.equal(requestLocale(null, 'zh;q=0.2,en-US;q=0.9'), 'en');
	assert.equal(requestLocale(null, 'zh;q=0,en;q=1'), 'en');
	assert.equal(requestLocale(null, 'fr-FR,zh-TW;q=0.8'), 'zh');
	assert.equal(requestLocale('session=example; inbox-language=en', 'zh-CN'), 'en');
	assert.equal(requestLocale('inbox-language=zh', 'en-US'), 'zh');
	assert.equal(requestLocale('inbox-language=bad', 'zh-CN'), 'zh');
	assert.equal(requestLocale('inbox-language=%ZZ', 'en'), 'en');
	assert.equal(requestLocale('other-inbox-language=zh', 'en'), 'en');
	assert.match(languageCookie('zh', true), /^inbox-language=zh; Path=\/; Max-Age=31536000; SameSite=Lax; Secure$/);
	assert.doesNotMatch(languageCookie('en', false), /Secure/);
	assert.equal(translateMessage('邮箱或密码不正确。', 'en'), 'Incorrect email or password.');
	assert.equal(translateMessage('Enter a valid forwarding email address.', 'zh'), '请输入有效的转发邮箱地址。');
	assert.equal(translateMessage('Custom provider diagnostic', 'zh'), 'Custom provider diagnostic');
	const date = '2024-04-15T15:42:00Z';
	for (const format of [formatListDate, formatDetailDate, formatShortDate]) {
		assert.notEqual(format(date, 'en-US'), format(date, 'zh-CN'));
		assert.equal(format('invalid date', 'zh-CN'), 'invalid date');
	}
	assert.match(formatQuotedDate(date), /Apr/);
	await build({
		stdin: { contents: `import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider, useI18n } from './app/hooks/useI18n';
function Probe() {
 const { t, folderName, message } = useI18n();
 return createElement('div', null, [t('Language', '语言'), folderName('draft'), folderName('spam'), folderName('all', 'My All'), folderName('drafts', 'My drafts'), message('Attachments can be up to 25 MB in total.')].join('|'));
}
export const render = locale => renderToStaticMarkup(createElement(I18nProvider, { initialLocale: locale }, createElement(Probe)));`, resolveDir: process.cwd(), loader: 'tsx' },
		outfile: join(dir, 'render.cjs'), tsconfig: 'tsconfig.cloudflare.json', bundle: true, format: 'cjs', platform: 'node', define: { 'process.env.NODE_ENV': '"production"' },
	});
	const { render } = await import(pathToFileURL(join(dir, 'render.cjs')));
	assert.equal(render('zh'), '<div>语言|草稿|垃圾邮件|My All|My drafts|附件总大小不得超过 25 MB。</div>');
	assert.equal(render('en'), '<div>Language|Drafts|Spam|My All|My drafts|Attachments can be up to 25 MB in total.</div>');
	console.log('PASS: locale negotiation, saved preference, invalid cookie fallback, persistence, error translation, localized dates, isolated SSR and custom folder names.');
} finally {
	await rm(dir, { recursive: true, force: true });
}
