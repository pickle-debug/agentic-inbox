import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

const dir = await mkdtemp(join(tmpdir(), 'inbox-automatic-replies-test-'));
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
const mailbox = 'support@example.com';
const path = `/api/v1/mailboxes/${mailbox}`;
const message = '你好，我们已经收到你的邮件，请不要重复发送\n<script>unsafe</script>';
const reply = { enabled: true, subject: '', message };
let fixture = 0;
async function request(url, { method = 'GET', body, cookie } = {}) {
	return mf.dispatchFetch(origin + url, { method, headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
}
const update = (settings, cookie) => request(path, { method: 'PUT', body: { settings }, cookie });
const setDrafts = (enabled) => request('/api/v1/settings', { method: 'PUT', body: { autoDraftRepliesEnabled: enabled, agentSystemPrompt: '' } });
const read = async () => (await (await request(path)).json()).settings;
const list = async (folder) => (await (await request(`${path}/emails?folder=${folder}`)).json());
function fixtureMessage({ sender = `sender${++fixture}@example.net`, subject = 'Support request', id = `fixture-${++fixture}@example.net`, extra = [], toHeader = `To: ${mailbox}` } = {}) {
	return { from: sender, raw: [`From: Customer <${sender}>`, toHeader, `Subject: ${subject}`, ...(id ? [`Message-ID: <${id}>`] : []), ...extra, 'Content-Type: text/plain; charset=utf-8', '', 'Please help'].filter(line => line !== null).join('\r\n') };
}
async function receive(options = {}, status = 200) {
	const response = await request('/__receive', { method: 'POST', body: { to: mailbox, ...fixtureMessage(), ...options } });
	assert.equal(response.status, status);
	return (await response.json()).sent;
}
try {
	for (const email of [mailbox, 'other@example.com']) assert.equal((await request('/api/v1/mailboxes', { method: 'POST', body: { email, name: 'Fixture' } })).status, 201);
	assert.deepEqual((await read()).autoReply, { enabled: false, subject: '', message: '' });
	assert.deepEqual(await receive(), []);
	const before = await read();
	for (const settings of [{ autoReply: null }, { autoReply: { ...reply, enabled: 'true' } }, { autoReply: { ...reply, message: '  ' } }, { autoReply: { ...reply, message: 'x'.repeat(10001) } }, { autoReply: { ...reply, subject: 'x'.repeat(201) } }, { autoReply: { ...reply, subject: 'Hello\r\nBcc: victim@example.net' } }, { autoDraftRepliesEnabled: 'true' }, { autoDraftRepliesEnabled: null }]) {
		assert.equal((await update(settings)).status, 400, JSON.stringify(settings).slice(0, 200));
	}
	assert.deepEqual(await read(), before, 'invalid updates must not change settings');
	for (const subject of ['\nHello', 'Hello\n', '\rHello', 'Hello\r']) {
		assert.equal((await update({ autoReply: { ...reply, subject } })).status, 400, 'subject must reject CR/LF before trimming');
	}
	assert.equal((await update({ signature: { enabled: true, text: 'Keep signature' }, extra: 'preserved' })).status, 200);
	assert.equal((await update({ autoReply: { ...reply, subject: '  收到邮件  ' } })).status, 200);
	assert.equal((await read()).autoReply.subject, '收到邮件');
	assert.equal((await read()).signature.text, 'Keep signature');
	assert.equal((await read()).agentSystemPrompt, undefined);
	assert.equal((await read()).extra, 'preserved');
	assert.equal((await update({ autoReply: reply })).status, 200);
	const sent = await receive(fixtureMessage({ id: 'original@example.net', extra: ['Reply-To: attacker@example.net'], toHeader: 'To: other@example.com\r\nCc: third@example.net' }));
	assert.equal(sent.length, 1);
	assert.equal(sent[0].storedCount, 2, 'Inbox must be persisted before sending');
	assert.match(sent[0].to, /^sender\d+@example.net$/);
	assert.equal(sent[0].cc, undefined);
	assert.equal(sent[0].bcc, undefined);
	assert.equal(sent[0].text, message);
	assert.doesNotMatch(sent[0].html, /<script>/);
	assert.match(sent[0].html, /&lt;script&gt;/);
	assert.equal(sent[0].subject, 'Re: Support request');
	const headers = new Headers(sent[0].headers);
	assert.equal(headers.get('Auto-Submitted'), 'auto-replied');
	assert.equal(headers.get('X-Auto-Response-Suppress').toLowerCase(), 'all');
	assert.equal(headers.get('X-Agentic-Inbox-Auto-Reply'), 'true');
	assert.equal(headers.get('In-Reply-To'), '<original@example.net>');
	assert.ok(headers.get('Message-ID'));
	const inbox = await list('inbox');
	const sentFolder = await list('sent');
	assert.equal(sentFolder.totalCount, 1);
	assert.ok(inbox.emails.some(email => email.thread_id === sentFolder.emails[0].thread_id), 'reply belongs to the original thread');
	assert.deepEqual(await receive({ to: 'other@example.com' }), [], 'settings belong to envelope mailbox');
	assert.equal((await receive(fixtureMessage({ toHeader: null, subject: 'Re: Existing thread' })))[0].subject, 'Re: Existing thread', 'BCC and existing reply prefix are supported');
	for (const extra of [['Auto-Submitted: auto-generated'], ['Auto-Submitted: auto-replied'], ['Precedence: bulk'], ['Precedence: list'], ['Precedence: junk'], ['List-Id: <list.example.net>'], ['List-Unsubscribe: <https://example.net/unsubscribe>'], ['X-Auto-Response-Suppress: OOF'], ['X-Auto-Response-Suppress: AutoReply'], ['X-Auto-Response-Suppress: All'], ['X-Agentic-Inbox-Auto-Reply: true'], ['X-Agentic-Inbox-Forwarded: true']]) {
		assert.deepEqual(await receive(fixtureMessage({ extra })), [], extra.join());
	}
	for (const sender of [mailbox, 'no-reply@example.net', 'mailer-daemon@example.net', 'postmaster@example.net']) assert.deepEqual(await receive(fixtureMessage({ sender })), [], sender);
	for (const from of ['', '<>', 'not an address']) assert.deepEqual(await receive({ ...fixtureMessage(), from }), [], 'invalid envelope sender');
	assert.deepEqual(await receive(fixtureMessage({ extra: ['Return-Path: <>'] })), [], 'null Return-Path suppresses reply even with nonempty envelope sender');
	assert.equal((await receive(fixtureMessage({ extra: ['Auto-Submitted: no'] }))).length, 1, 'Auto-Submitted: no is an ordinary message');
	assert.equal((await receive({ ...fixtureMessage({ sender: 'visible@example.net' }), from: 'envelope@example.net' }))[0].to, 'envelope@example.net');
	const duplicate = fixtureMessage({ sender: 'duplicate@example.net' });
	const concurrent = await Promise.all([receive(duplicate), receive(duplicate)]);
	assert.equal(concurrent.flat().length, 1, 'concurrent duplicates send once');
	assert.deepEqual(await receive(fixtureMessage({ sender: 'duplicate@example.net' })), [], 'same sender is limited for 24 hours');
	const noId = fixtureMessage({ sender: 'noid@example.net', id: null });
	assert.equal((await receive(noId)).length, 1);
	assert.deepEqual(await receive(noId), [], 'messages without Message-ID are deduplicated');
	const sentBeforeFailure = (await list('sent')).totalCount;
	const failed = fixtureMessage({ sender: 'failure@example.net' });
	assert.equal((await receive({ ...failed, failSend: true })).length, 1);
	assert.equal((await list('sent')).totalCount, sentBeforeFailure, 'failed sends are not saved as Sent');
	assert.deepEqual(await receive(failed), [], 'failed attempts must not be retried on redelivery');
	assert.deepEqual(await receive({ failStore: true }, 500), [], 'failed Inbox storage prevents sending');
	assert.equal((await setDrafts(true)).status, 200);
	assert.equal((await receive()).length, 1);
	assert.equal((await list('draft')).totalCount, 1, 'fixed reply and AI draft coexist');
	assert.equal((await receive({ failSend: true })).length, 1);
	assert.equal((await list('draft')).totalCount, 2, 'send failure must not block drafts');
	assert.equal((await receive(fixtureMessage({ subject: 'Fail draft' }))).length, 1, 'draft failure must not block fixed reply');
	assert.equal((await update({ autoReply: { ...reply, enabled: false } })).status, 200);
	assert.deepEqual(await receive(), []);
	assert.equal((await list('draft')).totalCount, 3, 'draft-only mode still works');
	assert.equal((await update({ autoReply: reply })).status, 200);
	assert.equal((await setDrafts(false)).status, 200);
	await request('/__quota', { method: 'POST', body: { mailbox, expire: true } });
	assert.deepEqual(await receive(duplicate), [], 'message deduplication persists after sender cooldown expires');
	assert.deepEqual(await receive(noId), [], 'raw MIME hash deduplication persists after sender cooldown expires');
	assert.equal((await receive(fixtureMessage({ sender: 'duplicate@example.net' }))).length, 1, 'new message can reply after cooldown expires');
	for (const [email, count, age, limit] of [['hourly@example.com', 19, 0, 'hour'], ['daily@example.com', 99, 7_200_000, 'day']]) {
		assert.equal((await request('/api/v1/mailboxes', { method: 'POST', body: { email, name: 'Quota fixture', settings: { autoReply: reply } } })).status, 201);
		await request('/__quota', { method: 'POST', body: { mailbox: email, count, age } });
		assert.equal((await receive({ to: email })).length, 1, 'manual sends share quota with automatic replies');
		const rate = await (await request('/__quota', { method: 'POST', body: { mailbox: email } })).json();
		assert.match(rate.error, new RegExp(`per ${limit}`), 'successful automatic send counts exactly once');
		assert.deepEqual(await receive({ to: email }), [], 'automatic reply respects mailbox quota');
		assert.equal((await request(`/api/v1/mailboxes/${email}/emails`, { method: 'POST', body: { from: email, to: 'recipient@example.net', subject: 'Quota blocked', text: 'Must not send' } })).status, 429, 'manual endpoint respects automatic reply quota');
	}
	const bucket = await mf.getR2Bucket('BUCKET');
	const configuredSettings = await read();
	for (const stored of [JSON.stringify({ fromName: 'Legacy mailbox' }), '{']) {
		await bucket.put(`mailboxes/${mailbox}.json`, stored);
		const incoming = fixtureMessage({ subject: `Unreadable settings fixture ${++fixture}` });
		assert.deepEqual(await receive(incoming), [], 'legacy or unreadable settings must not trigger automatic reply');
		const retained = await list('inbox');
		assert.ok(retained.emails.some(email => email.sender === incoming.from), 'Inbox survives legacy or unreadable settings');
	}
	await bucket.put(`mailboxes/${mailbox}.json`, JSON.stringify(configuredSettings));
	const password = 'fixture-password-123456';
	assert.equal((await request(path + '/login', { method: 'PUT', body: { password } })).status, 200);
	const login = await request('/auth/login', { method: 'POST', body: { email: mailbox, password } });
	const cookie = login.headers.get('set-cookie').split(';')[0];
	assert.equal((await update({ autoReply: reply }, cookie)).status, 200);
	assert.equal((await request('/api/v1/mailboxes/other@example.com', { method: 'PUT', cookie, body: { settings: { autoReply: reply } } })).status, 403);
	console.log('PASS: automatic reply validation, merge, permissions, mailbox isolation, envelope routing, safe HTML, Sent/thread persistence, loop suppression, concurrent and permanent deduplication, sender cooldown, shared hourly/daily quotas, failure isolation and AI draft coexistence. No external email or AI requests.');
} finally {
	await mf.dispose();
	await rm(dir, { recursive: true, force: true });
}
