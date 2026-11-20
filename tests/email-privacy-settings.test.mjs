import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

const dir = await mkdtemp(join(tmpdir(), 'inbox-privacy-settings-'));
let mf;
try {
	await build({ entryPoints: ['shared/email-privacy.ts'], outfile: join(dir, 'policy.mjs'), bundle: true, format: 'esm', platform: 'node' });
	const { emailPrivacySettingsSchema: schema, shouldUsePrivateReading: matches } = await import(pathToFileURL(join(dir, 'policy.mjs')));
	const policy = schema.parse({ enabled: true, domains: [' EXAMPLE.NET. ', 'example.net', 'mail.other.test'] });
	assert.deepEqual(policy, { enabled: true, domains: ['example.net', 'mail.other.test'] });
	for (const sender of ['sender@example.net', 'sender@sub.example.net', 'Sender <SENDER@EXAMPLE.NET>', 'sender@deep.sub.example.net', 'sender@mail.other.test']) assert.equal(matches(sender, policy), true, sender);
	for (const sender of ['sender@fakeexample.net', 'sender@example.net.evil.test', 'example.net <sender@other.test>', 'sender@other.test']) assert.equal(matches(sender, policy), false, sender);
	assert.equal(matches('sender@example.net', undefined), false, 'legacy mailboxes retain normal HTML');
	assert.equal(matches('sender@example.net', { enabled: false, domains: ['example.net'] }), false);
	assert.equal(matches('malformed sender', policy), true, 'do not load remote content when a protected sender cannot be parsed');
	assert.equal(matches('sender@example.net', { enabled: true, domains: [] }), true, 'corrupt policy fails closed');
	for (const domains of [['https://example.net'], ['@example.net'], ['*.example.net'], ['example.net/path'], ['-bad.example.net'], ['example..net'], ['example.net:443'], ['localhost'], Array(101).fill('example.net')]) assert.equal(schema.safeParse({enabled: true, domains}).success, false);
	assert.equal(schema.safeParse({ enabled: true, domains: [] }).success, false);
	assert.equal(schema.safeParse({ enabled: false, domains: [] }).success, true);

	await build({ entryPoints: ['tests/auth-worker.ts'], outfile: join(dir, 'worker.mjs'), bundle: true, format: 'esm', platform: 'node', external: ['cloudflare:*'], conditions: ['workerd', 'worker', 'browser'], define: { 'process.env.NODE_ENV': '"test"' } });
	mf = new Miniflare({
		modules: true, modulesRoot: dir, scriptPath: join(dir, 'worker.mjs'),
		compatibilityDate: '2025-11-28', compatibilityFlags: ['nodejs_compat'],
		outboundService: () => new Response('No external network in tests', { status: 403 }),
		bindings: { DOMAINS: 'example.com', EMAIL_ADDRESSES: [], DEV_ADMIN_EMAIL: 'admin@example.net' },
		r2Buckets: ['BUCKET'],
		durableObjects: { AUTH: {className: 'AuthStore', useSQLite: true}, MAILBOX: {className: 'MailboxDO', useSQLite: true}, EMAIL_AGENT: {className: 'EmailAgent', useSQLite: true} },
	});
	const origin = 'https://mail.example.test';
	const mailbox = 'reader@example.com';
	const request = (path, method = 'GET', body, cookie) => mf.dispatchFetch(origin + path, { method, headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
	const settings = async () => (await request('/api/v1/settings')).json();
	const config = async (cookie) => (await request('/api/v1/config', 'GET', undefined, cookie)).json();
	const saveSystem = (body, cookie) => request('/api/v1/settings', 'PUT', body, cookie);
	const base = { autoDraftRepliesEnabled: false, agentSystemPrompt: '' };
	for (const email of [mailbox, 'other@example.com']) assert.equal((await request('/api/v1/mailboxes', 'POST', {email, name: 'Fixture'})).status, 201);
	const bucket = await mf.getR2Bucket('BUCKET');
	assert.equal(JSON.parse(await (await bucket.get(`mailboxes/${mailbox}.json`)).text()).privacy, undefined, 'new mailboxes carry no per-mailbox rules');
	// Before a system-wide policy is saved, readers keep each mailbox's old rules (config null)
	// and System settings offers the enabled old rules as its starting value.
	assert.equal((await config()).privacy, null);
	assert.deepEqual((await settings()).privacy, { enabled: false, domains: [] });
	await bucket.put(`mailboxes/${mailbox}.json`, JSON.stringify({ fromName: 'Legacy', privacy: { enabled: true, domains: ['mail.other.test', 'example.net'] } }));
	await bucket.put('mailboxes/other@example.com.json', JSON.stringify({ fromName: 'Off', privacy: { enabled: false, domains: ['disabled.test'] } }));
	assert.deepEqual((await settings()).privacy, { enabled: true, domains: ['example.net', 'mail.other.test'] }, 'enabled old rules are offered, disabled ones are not');
	assert.equal((await config()).privacy, null, 'offering old rules saves nothing');
	assert.equal(await bucket.get('settings/system.json'), null);
	// Saving creates one normalized policy for every mailbox.
	assert.equal((await saveSystem({ ...base, privacy: { enabled: true, domains: [' EXAMPLE.NET. ', 'example.net', 'foxmail.com'] } })).status, 200);
	assert.deepEqual((await config()).privacy, { enabled: true, domains: ['example.net', 'foxmail.com'] });
	assert.deepEqual((await settings()).privacy, { enabled: true, domains: ['example.net', 'foxmail.com'] });
	const before = await (await bucket.get('settings/system.json')).text();
	for (const invalid of [null, [], {}, {enabled: 'true', domains: ['example.net']}, {enabled: true, domains: []}, {enabled: true, domains: ['https://example.net']}, {enabled: false, domains: 'example.net'}, {enabled: true, domains: ['example.net'], extra: true}]) {
		assert.equal((await saveSystem({ ...base, privacy: invalid })).status, 400, JSON.stringify(invalid));
		assert.equal(await (await bucket.get('settings/system.json')).text(), before);
	}
	// A save that omits the policy keeps it, so another settings client cannot switch protection off.
	assert.equal((await saveSystem({ ...base, unreadBadgeStyle: 'dot' })).status, 200);
	assert.deepEqual((await config()).privacy, { enabled: true, domains: ['example.net', 'foxmail.com'] });
	assert.equal((await saveSystem({ ...base, privacy: { enabled: false, domains: ['example.net'] } })).status, 200);
	assert.deepEqual((await config()).privacy, { enabled: false, domains: ['example.net'] }, 'switching off keeps the list');
	// Per-mailbox rules can no longer be written; other mailbox settings still save.
	const rejected = await request(`/api/v1/mailboxes/${mailbox}`, 'PUT', { settings: { privacy: policy } });
	assert.equal(rejected.status, 400);
	assert.match((await rejected.json()).error, /系统设置/);
	assert.equal((await request('/api/v1/mailboxes', 'POST', { email: 'third@example.com', name: 'Third', settings: { privacy: { enabled: false, domains: [] } } })).status, 400);
	assert.equal((await request(`/api/v1/mailboxes/${mailbox}`, 'PUT', { settings: { fromName: 'Keep working' } })).status, 200);
	assert.equal((await (await request(`/api/v1/mailboxes/${mailbox}`)).json()).settings.fromName, 'Keep working');
	// Every signed-in viewer receives the policy; only administrators can change it.
	const password = 'privacy-fixture-password-123456';
	assert.equal((await request(`/api/v1/mailboxes/${mailbox}/login`, 'PUT', { password })).status, 200);
	const login = await request('/auth/login', 'POST', { email: mailbox, password });
	assert.equal(login.status, 200);
	const cookie = login.headers.get('set-cookie').split(';')[0];
	assert.deepEqual((await config(cookie)).privacy, { enabled: false, domains: ['example.net'] });
	assert.equal((await saveSystem({ ...base, privacy: policy }, cookie)).status, 403);
	assert.equal((await request(`/api/v1/mailboxes/${mailbox}`, 'PUT', { settings: { privacy: policy } }, cookie)).status, 400);
	// An unreadable settings file must not let remote content load.
	await bucket.put('settings/system.json', '{broken');
	assert.deepEqual((await config()).privacy, { enabled: true, domains: [] }, 'readers fall back to an always-private policy');
	console.log('PASS: domain normalization, subdomain boundaries, lookalike domains, default/disabled and corrupt policies, system-wide policy for every mailbox, migration offer from old per-mailbox rules, API validation, omitted-field preservation, per-mailbox write rejection, viewer access and admin-only changes. No external network.');
} finally {
	await mf?.dispose();
	await rm(dir, {recursive: true, force: true});
}
