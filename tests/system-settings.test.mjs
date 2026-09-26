import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

const dir = await mkdtemp(join(tmpdir(), 'inbox-system-settings-test-'));
await build({ entryPoints: ['tests/automatic-replies-worker.ts'], outfile: join(dir, 'worker.mjs'), bundle: true, format: 'esm', platform: 'node', external: ['cloudflare:*'], conditions: ['workerd', 'worker', 'browser'], define: { 'process.env.NODE_ENV': '"test"' } });
const mf = new Miniflare({
	modules: true, modulesRoot: dir, scriptPath: join(dir, 'worker.mjs'),
	compatibilityDate: '2025-11-28', compatibilityFlags: ['nodejs_compat'],
	outboundService: () => new Response('No network in tests', { status: 403 }),
	bindings: { DOMAINS: 'example.com', EMAIL_ADDRESSES: [], DEV_ADMIN_EMAIL: 'admin@example.net' },
	r2Buckets: ['BUCKET'],
	durableObjects: { AUTH: { className: 'AuthStore', useSQLite: true }, MAILBOX: { className: 'MailboxDO', useSQLite: true }, EMAIL_AGENT: { className: 'EmailAgent', useSQLite: true }, CONTACTS: { className: 'ContactsStore', useSQLite: true } },
});
const origin = 'https://mail.example.test';
const mailboxes = ['first@example.com', 'second@example.com'];
const defaults = { autoDraftRepliesEnabled: false, agentSystemPrompt: '' };
const endpoint = '/api/v1/settings';
let count = 0;
async function request(path, { method = 'GET', body, cookie } = {}) {
	return mf.dispatchFetch(origin + path, { method, headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
}
const set = (body) => request(endpoint, { method: 'PUT', body });
const get = async () => (await request(endpoint)).json();
const drafts = async (email) => (await (await request(`/api/v1/mailboxes/${email}/emails?folder=draft`)).json()).totalCount;
async function receive(to, options = {}) {
	const from = `sender${++count}@example.net`;
	const raw = [`From: ${from}`, `To: ${to}`, 'Subject: Fixture', `Message-ID: <message${count}@example.net>`, 'Content-Type: text/plain', '', 'Please reply'].join('\r\n');
	const response = await request('/__receive', { method: 'POST', body: { to, from, raw, ...options } });
	assert.equal(response.status, 200);
	return (await response.json()).sent;
}
try {
	const bucket = await mf.getR2Bucket('BUCKET');
	assert.deepEqual(await get(), defaults);
	assert.equal((await request(endpoint, { method: 'HEAD' })).status, 200);
	assert.equal((await request(endpoint, { cookie: '__Host-inbox_session=invalid' })).status, 401);
	assert.equal(await bucket.get('settings/system.json'), null, 'reading defaults must not write');
	const defaultPrompt = (await (await request('/__prompt')).json()).prompt;
	assert.match(defaultPrompt, /email assistant/);
	for (const email of mailboxes) {
		assert.equal((await request('/api/v1/mailboxes', { method: 'POST', body: { email, name: 'Fixture' } })).status, 201);
		const key = `mailboxes/${email}.json`;
		const stored = await (await bucket.get(key)).json();
		await bucket.put(key, JSON.stringify({ ...stored, autoDraftRepliesEnabled: true, agentSystemPrompt: 'Old mailbox prompt', legacy: 'Keep' }));
		const route = `/api/v1/mailboxes/${email}`;
		const read = (await (await request(route)).json()).settings;
		assert.equal(read.autoDraftRepliesEnabled, undefined);
		assert.equal(read.agentSystemPrompt, undefined);
		assert.equal((await request(route, { method: 'PUT', body: { settings: { fromName: 'Updated' } } })).status, 200);
		const preserved = await (await bucket.get(key)).json();
		assert.equal(preserved.agentSystemPrompt, 'Old mailbox prompt');
		assert.equal(preserved.autoDraftRepliesEnabled, true);
		assert.equal(preserved.legacy, 'Keep');
		await receive(email);
		assert.equal(await drafts(email), 0, 'missing global settings do not migrate mailbox opt-ins');
	}
	assert.equal((await (await request('/__prompt')).json()).prompt, defaultPrompt, 'legacy mailbox prompt is ignored');
	for (const settings of [{ autoDraftRepliesEnabled: true }, { agentSystemPrompt: '' }]) {
		const changed = await request(`/api/v1/mailboxes/${mailboxes[0]}`, { method: 'PUT', body: { settings } });
		assert.equal(changed.status, 400);
		assert.match((await changed.json()).error, /系统设置/);
		assert.equal((await request('/api/v1/mailboxes', { method: 'POST', body: { email: 'invalid@example.com', name: 'Invalid', settings } })).status, 400);
	}
	assert.equal((await set({ autoDraftRepliesEnabled: true, agentSystemPrompt: '  Global prompt  ' })).status, 200);
	assert.deepEqual(await get(), { autoDraftRepliesEnabled: true, agentSystemPrompt: 'Global prompt' });
	assert.equal((await (await request('/__prompt')).json()).prompt, 'Global prompt');
	const before = await (await bucket.get('settings/system.json')).text();
	for (const invalid of [null, [], {}, { autoDraftRepliesEnabled: true }, { ...defaults, autoDraftRepliesEnabled: 'true' }, { ...defaults, agentSystemPrompt: null }, { ...defaults, agentSystemPrompt: 'x'.repeat(20_001) }, { ...defaults, other: true }]) {
		assert.equal((await set(invalid)).status, 400);
		assert.equal(await (await bucket.get('settings/system.json')).text(), before);
	}
	for (const email of mailboxes) {
		await receive(email);
		assert.equal(await drafts(email), 1, 'global enable applies to both mailboxes');
	}
	assert.equal((await set({ ...defaults, agentSystemPrompt: 'Next prompt' })).status, 200);
	assert.equal((await (await request('/__prompt')).json()).prompt, 'Next prompt', 'prompt reads are not cached');
	for (const email of mailboxes) {
		await receive(email);
		assert.equal(await drafts(email), 1, 'global disable overrides legacy mailbox true');
	}
	assert.equal((await set({ ...defaults, agentSystemPrompt: '  ' })).status, 200);
	assert.equal((await (await request('/__prompt')).json()).prompt, defaultPrompt);
	const mailboxRoute = `/api/v1/mailboxes/${mailboxes[0]}`;
	assert.equal((await request(mailboxRoute, { method: 'PUT', body: { settings: { autoReply: { enabled: true, subject: '', message: 'Received' } } } })).status, 200);
	for (const corrupt of ['{', JSON.stringify({ autoDraftRepliesEnabled: true, agentSystemPrompt: null })]) {
		await bucket.put('settings/system.json', corrupt);
		assert.equal((await receive(mailboxes[0])).length, 1, 'invalid global settings do not block fixed replies');
		assert.equal(await drafts(mailboxes[0]), 1, 'invalid global settings cannot start AI');
		assert.equal((await request('/__prompt')).status, 503, 'prompt read errors do not silently use a different prompt');
	}
	await set({ ...defaults, autoDraftRepliesEnabled: true });
	assert.equal((await receive(mailboxes[0], { failSettings: true })).length, 1, 'R2 read failure does not block fixed replies');
	assert.equal(await drafts(mailboxes[0]), 1, 'R2 read failure cannot start AI');
	await set(defaults);
	const password = 'fixture-password-123456';
	assert.equal((await request(mailboxRoute + '/login', { method: 'PUT', body: { password } })).status, 200);
	const login = await request('/auth/login', { method: 'POST', body: { email: mailboxes[0], password } });
	const cookie = login.headers.get('set-cookie').split(';')[0];
	for (const method of ['GET', 'HEAD', 'PUT']) {
		assert.equal((await request(endpoint, { method, cookie, ...(method === 'PUT' ? { body: { ...defaults, autoDraftRepliesEnabled: true } } : {}) })).status, 403);
	}
	assert.deepEqual(await get(), defaults, 'mailbox identity cannot change global settings');
	console.log('PASS: global settings defaults, strict validation, admin-only GET/HEAD/PUT, legacy field isolation, retained old data, two-mailbox AI scope, live prompt reads, global disable, and fixed reply failure isolation. No external email or AI.');
} finally {
	await mf.dispose();
	await rm(dir, { recursive: true, force: true });
}
