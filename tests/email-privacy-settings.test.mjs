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
	const endpoint = `/api/v1/mailboxes/${mailbox}`;
	const request = (path, method = 'GET', body, cookie) => mf.dispatchFetch(origin + path, { method, headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
	const save = (privacy, cookie) => request(endpoint, 'PUT', { settings: {privacy} }, cookie);
	const read = async () => (await (await request(endpoint)).json()).settings;
	for (const email of [mailbox, 'other@example.com']) assert.equal((await request('/api/v1/mailboxes', 'POST', {email, name: 'Fixture'})).status, 201);
	assert.deepEqual((await read()).privacy, {enabled: false, domains: []});
	assert.equal((await save({ enabled: true, domains: [' EXAMPLE.NET. ', 'example.net'] })).status, 200);
	assert.deepEqual((await read()).privacy, { enabled: true, domains: ['example.net'] });
	assert.equal((await request(endpoint, 'PUT', {settings: {fromName: 'Keep privacy'}})).status, 200);
	assert.deepEqual((await read()).privacy, { enabled: true, domains: ['example.net'] }, 'unrelated settings updates preserve policy');
	for (const invalid of [null, [], {}, {enabled: 'true', domains: ['example.net']}, {enabled: true, domains: []}, {enabled: true, domains: ['https://example.net']}, {enabled: false, domains: 'example.net'}, {enabled: true, domains: ['example.net'], extra: true}]) {
		assert.equal((await save(invalid)).status, 400, JSON.stringify(invalid));
		assert.deepEqual((await read()).privacy, {enabled: true, domains: ['example.net']});
	}
	assert.equal((await save({enabled: false, domains: ['example.net']})).status, 200);
	assert.deepEqual((await read()).privacy, {enabled: false, domains: ['example.net']});
	assert.equal((await read()).fromName, 'Keep privacy');
	const bucket = await mf.getR2Bucket('BUCKET');
	assert.deepEqual(JSON.parse(await (await bucket.get(`mailboxes/${mailbox}.json`)).text()).privacy, {enabled: false, domains: ['example.net']});
	const password = 'privacy-fixture-password-123456';
	assert.equal((await request(endpoint + '/login', 'PUT', {password})).status, 200);
	const login = await request('/auth/login', 'POST', {email: mailbox, password});
	assert.equal(login.status, 200);
	const cookie = login.headers.get('set-cookie').split(';')[0];
	assert.equal((await save(policy, cookie)).status, 200, 'mailbox user can set their own policy');
	assert.equal((await request('/api/v1/mailboxes/other@example.com', 'PUT', {settings: {privacy: policy}}, cookie)).status, 403);
	await bucket.put(`mailboxes/${mailbox}.json`, JSON.stringify({fromName: 'Legacy'}));
	assert.equal((await read()).privacy, undefined);
	assert.equal((await save(policy)).status, 200, 'legacy mailboxes can opt in without a migration');
	console.log('PASS: domain normalization, subdomain boundaries, lookalike domains, legacy/default/disabled and corrupt policies, API validation, partial updates, R2 persistence and mailbox permissions. No external network.');
} finally {
	await mf?.dispose();
	await rm(dir, {recursive: true, force: true});
}
