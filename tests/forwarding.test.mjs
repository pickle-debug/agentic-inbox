import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

const dir = await mkdtemp(join(tmpdir(), 'inbox-forwarding-test-'));
await build({ entryPoints: ['tests/forwarding-worker.ts'], outfile: join(dir, 'worker.mjs'), bundle: true, format: 'esm', platform: 'node', external: ['cloudflare:*'], conditions: ['workerd', 'worker', 'browser'], define: { 'process.env.NODE_ENV': '"test"' } });
const mf = new Miniflare({
	modules: true, modulesRoot: dir, scriptPath: join(dir, 'worker.mjs'),
	compatibilityDate: '2025-11-28', compatibilityFlags: ['nodejs_compat'],
	outboundService: () => new Response('No network in tests', { status: 403 }),
	bindings: { DOMAINS: 'example.com', EMAIL_ADDRESSES: [], DEV_ADMIN_EMAIL: 'admin@example.net' },
	r2Buckets: ['BUCKET'],
	durableObjects: { AUTH: { className: 'AuthStore', useSQLite: true }, MAILBOX: { className: 'MailboxDO', useSQLite: true }, EMAIL_AGENT: { className: 'EmailAgent', useSQLite: true } },
});
const origin = 'https://mail.example.test';
const mailbox = 'contact@example.com';
const path = `/api/v1/mailboxes/${mailbox}`;
const target = 'destination@example.net';
async function request(url, { method = 'GET', body, cookie } = {}) {
	return mf.dispatchFetch(origin + url, { method, headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
}
const update = (settings, cookie) => request(path, { method: 'PUT', body: { settings }, cookie });
const read = async () => (await (await request(path)).json()).settings;
function mime(toHeader = `To: ${mailbox}`) {
	return ['From: Sender <sender@example.net>', toHeader, 'Subject: Forwarding fixture', 'Message-ID: <fixture@example.net>', 'MIME-Version: 1.0', 'Content-Type: multipart/mixed; boundary="fixture"', '', '--fixture', 'Content-Type: text/plain; charset=utf-8', '', 'Original body', '--fixture', 'Content-Type: application/octet-stream', 'Content-Disposition: attachment; filename="fixture.bin"', 'Content-Transfer-Encoding: base64', '', 'AAEC/v8=', '--fixture--', ''].filter(line => line !== null).join('\r\n');
}
async function receive(options = {}) {
	const response = await request('/__receive', { method: 'POST', body: { to: mailbox, raw: mime(), ...options } });
	assert.equal(response.status, 200);
	return (await response.json()).forwarded;
}

try {
	for (const email of [mailbox, 'other@example.com']) {
		assert.equal((await request('/api/v1/mailboxes', { method: 'POST', body: { email, name: 'Fixture' } })).status, 201);
	}
	assert.deepEqual((await read()).forwarding, { enabled: false, email: '' });
	assert.deepEqual(await receive(), []);
	const before = await read();
	for (const settings of [null, [], { forwarding: null }, { forwarding: { enabled: 'true', email: target } }, { forwarding: { enabled: true } }, { forwarding: { enabled: true, email: 'invalid' } }, { forwarding: { enabled: true, email: ' CONTACT@EXAMPLE.COM ' } }]) {
		assert.equal((await update(settings)).status, 400, JSON.stringify(settings));
	}
	assert.deepEqual(await read(), before, 'invalid settings must not overwrite the mailbox');
	assert.equal((await request(path, { method: 'PUT', body: {} })).status, 400);
	assert.equal((await mf.dispatchFetch(origin + path, { method: 'PUT', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{' })).status, 400);
	assert.equal((await request('/api/v1/mailboxes', { method: 'POST', body: { email: 'invalid@example.com', name: 'Fixture', settings: { forwarding: { enabled: true, email: 'invalid@example.com' } } } })).status, 400);
	assert.equal((await update({ signature: { enabled: true, text: 'Keep me' }, extra: 'preserved' })).status, 200);
	assert.equal((await update({ forwarding: { enabled: true, email: ' DESTINATION@EXAMPLE.NET ' } })).status, 200);
	assert.deepEqual((await read()).forwarding, { enabled: true, email: target });
	assert.equal((await read()).signature.text, 'Keep me');
	assert.equal((await read()).extra, 'preserved');
	assert.equal((await update({ agentSystemPrompt: '' })).status, 400, 'AI settings require the system endpoint');
	assert.equal((await read()).agentSystemPrompt, undefined);
	assert.equal((await read()).forwarding.enabled, true);

	const forwarded = await receive({ to: 'CONTACT@EXAMPLE.COM', raw: mime('To: other@example.com\r\nCc: contact@example.com') });
	assert.equal(forwarded.length, 1);
	assert.equal(forwarded[0].to, target);
	assert.equal(forwarded[0].storedCount, 2, 'store in the envelope mailbox before forwarding');
	assert.equal(forwarded[0].headers['x-agentic-inbox-forwarded'], 'true');
	assert.equal((await (await request('/api/v1/mailboxes/other@example.com/emails?folder=inbox')).json()).totalCount, 0);
	const inbox = await (await request(path + '/emails?folder=inbox')).json();
	const email = await (await request(path + '/emails/' + inbox.emails[0].id)).json();
	assert.match(email.body, /Original body/);
	assert.equal(email.attachments.length, 1);
	const attachment = await request(path + '/emails/' + email.id + '/attachments/' + email.attachments[0].id);
	assert.deepEqual(Buffer.from(await attachment.arrayBuffer()), Buffer.from([0, 1, 2, 254, 255]));
	assert.equal((await receive({ raw: mime(null) })).length, 1, 'BCC without a To header must forward');
	assert.equal((await receive({ raw: mime('To: other@example.com'), allowedAddresses: [mailbox] })).length, 1);
	assert.deepEqual(await receive({ allowedAddresses: ['other@example.com'] }), [], 'allowlist uses envelope, not header');
	assert.deepEqual(await receive({ to: 'missing@example.com' }), []);
	assert.deepEqual(await receive({ headers: { 'X-Agentic-Inbox-Forwarded': 'true' } }), [], 'do not forward a returned copy again');
	const failedForward = await receive({ failForward: true });
	assert.equal(failedForward.length, 1, 'forward failure must not fail incoming delivery');
	assert.equal((await (await request(path + '/emails?folder=inbox')).json()).totalCount, failedForward[0].storedCount);
	const storageFailure = await request('/__receive', { method: 'POST', body: { to: mailbox, raw: mime(), failStore: true } });
	assert.equal(storageFailure.status, 500);
	assert.deepEqual((await storageFailure.json()).forwarded, [], 'do not forward if the Inbox copy failed');
	assert.equal((await update({ forwarding: { enabled: false, email: target } })).status, 200);
	assert.equal((await read()).forwarding.email, target);
	assert.deepEqual(await receive(), []);

	const bucket = await mf.getR2Bucket('BUCKET');
	for (const legacy of [{ fromName: 'Legacy' }, { forwarding: { enabled: true, email: mailbox } }, { forwarding: { enabled: true, email: 'invalid' } }]) {
		await bucket.put(`mailboxes/${mailbox}.json`, JSON.stringify(legacy));
		assert.deepEqual(await receive(), [], 'old or invalid stored configuration must fail closed');
	}
	await bucket.put(`mailboxes/${mailbox}.json`, '{');
	assert.deepEqual(await receive(), [], 'unreadable settings must not discard incoming email');
	await bucket.put(`mailboxes/${mailbox}.json`, JSON.stringify(before));
	const password = 'fixture-password-123456';
	assert.equal((await request(path + '/login', { method: 'PUT', body: { password } })).status, 200);
	const login = await request('/auth/login', { method: 'POST', body: { email: mailbox, password } });
	const cookie = login.headers.get('set-cookie').split(';')[0];
	assert.equal((await update({ forwarding: { enabled: true, email: target } }, cookie)).status, 200);
	assert.equal((await request('/api/v1/mailboxes/other@example.com', { method: 'PUT', cookie, body: { settings: { forwarding: { enabled: true, email: target } } } })).status, 403);
	console.log('PASS: forwarding configuration, normalization, validation, merge and AI field rejection, mailbox permissions, envelope/CC/BCC routing, Inbox and attachment retention, disabled/legacy settings, loop prevention and isolated forwarding/storage failures. No external email sent.');
} finally {
	await mf.dispose();
	await rm(dir, { recursive: true, force: true });
}
