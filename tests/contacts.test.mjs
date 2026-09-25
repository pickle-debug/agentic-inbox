import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

const dir = await mkdtemp(join(tmpdir(), 'inbox-contacts-test-'));
await build({ entryPoints: ['tests/auth-worker.ts'], outfile: join(dir, 'worker.mjs'), bundle: true, format: 'esm', platform: 'node', external: ['cloudflare:*'], conditions: ['workerd', 'worker', 'browser'], define: { 'process.env.NODE_ENV': '"test"' } });
const options = {
	modules: true, modulesRoot: dir, scriptPath: join(dir, 'worker.mjs'),
	compatibilityDate: '2025-11-28', compatibilityFlags: ['nodejs_compat'],
	outboundService: () => new Response('No network in tests', { status: 403 }),
	bindings: { DOMAINS: 'example.com', EMAIL_ADDRESSES: [] },
	r2Buckets: ['BUCKET'], r2Persist: join(dir, 'r2'), durableObjectsPersist: join(dir, 'durable'),
	durableObjects: {
		AUTH: { className: 'AuthStore', useSQLite: true },
		CONTACTS: { className: 'ContactsStore', useSQLite: true },
		MAILBOX: { className: 'MailboxDO', useSQLite: true },
		EMAIL_AGENT: { className: 'EmailAgent', useSQLite: true },
	},
};
let mf = new Miniflare(options);
const origin = 'https://mail.example.test';
const path = '/api/v1/contacts';
let adminCookie;
async function request(url = path, { method = 'GET', body, raw, cookie = adminCookie, source = origin } = {}) {
	return mf.dispatchFetch(origin + url, {
		method, headers: { Origin: source, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
		body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
	});
}
const create = (body, cookie) => request(path, { method: 'POST', body, cookie });
const list = async (query = '', cookie) => {
	const response = await request(path + query, { cookie });
	assert.equal(response.status, 200);
	assert.equal(response.headers.get('cache-control'), 'no-store');
	return response.json();
};

try {
	const bucket = await mf.getR2Bucket('BUCKET');
	const legacySettings = JSON.stringify({ fromName: 'Legacy', forwarding: { enabled: false, email: '' }, custom: 'preserved' });
	await bucket.put('mailboxes/member@example.com.json', legacySettings);
	const auth = await mf.getDurableObjectNamespace('AUTH');
	const authStore = auth.get(auth.idFromName('auth'));
	const password = 'local-contact-fixture-password';
	await authStore.setPassword('member@example.com', password);
	const login = await request('/auth/login', { method: 'POST', body: { email: 'member@example.com', password } });
	assert.equal(login.status, 200);
	const cookie = login.headers.get('set-cookie').split(';')[0];
	// The same email has distinct role-scoped sessions; its address grants no directory access.
	const adminSession = await authStore.adminSession('member@example.com', Date.now() + 3600_000);
	adminCookie = '__Host-inbox_session=' + adminSession.token;
	assert.equal((await (await request('/auth/session', { cookie })).json()).role, 'mailbox');
	assert.equal((await (await request('/auth/session')).json()).role, 'admin');
	assert.deepEqual(await list(), { contacts: [], totalCount: 0 });
	const alice = { name: ' Alice ', email: ' ALICE@EXAMPLE.NET ', notes: '业务合作 100% A_B', introduction: '负责市场策略' };
	const created = await create(alice);
	assert.equal(created.status, 201);
	assert.equal(created.headers.get('cache-control'), 'no-store');
	const first = await created.json();
	assert.deepEqual(Object.keys(first).sort(), ['id', 'name', 'email', 'notes', 'introduction', 'createdAt', 'updatedAt'].sort());
	assert.equal(first.name, 'Alice');
	assert.equal(first.email, 'alice@example.net');
	assert.equal(first.notes, alice.notes);
	assert.equal(first.introduction, alice.introduction);
	assert.ok(Number.isFinite(Date.parse(first.createdAt)));
	assert.equal(first.updatedAt, first.createdAt);
	assert.equal((await list()).contacts[0].notes, alice.notes);
	for (const [method, url] of [['GET', path], ['GET', path + '?q=alice'], ['GET', path + '?q=业务合作'], ['HEAD', path], ['HEAD', path + '?q=alice'], ['OPTIONS', path], ['POST', path], ['PUT', path + '/' + first.id], ['DELETE', path + '/' + first.id]]) {
		const denied = await request(url, { method, cookie, ...(['POST', 'PUT', 'DELETE'].includes(method) ? { body: alice } : {}) });
		assert.equal(denied.status, 403, method + ' ' + url);
		assert.equal(denied.headers.get('cache-control'), 'no-store');
		const text = await denied.text();
		if (method === 'HEAD') assert.equal(text, '');
		else assert.deepEqual(JSON.parse(text), { error: '仅管理员可以访问系统联系人。' });
		for (const value of [first.id, first.email, first.name, first.notes, first.introduction, 'contacts', 'totalCount']) assert.ok(!text.includes(value), '403 must not leak directory data: ' + value);
	}
	for (const [method, url] of [['POST', path], ['PUT', path + '/' + first.id], ['DELETE', path + '/' + first.id]]) {
		assert.equal((await request(url, { method, source: 'https://evil.example', body: alice })).status, 403);
	}
	assert.equal((await create({ name: 'Duplicate', email: first.email })).status, 409);
	for (const body of [null, {}, [], { name: '', email: 'a@example.net' }, { name: 'x'.repeat(121), email: 'a@example.net' }, { name: 'A', email: 'invalid' }, { name: 'A', email: 'a@example.net', notes: 'x'.repeat(1001) }, { name: 'A', email: 'a@example.net', introduction: 'x'.repeat(4001) }, { name: 'A', email: 'a@example.net', notes: null }]) {
		assert.equal((await create(body)).status, 400);
	}
	assert.equal((await request(path, { method: 'POST', raw: '{' })).status, 400);
	assert.equal((await request(path, { method: 'POST', raw: 'x'.repeat(65537) })).status, 413);
	assert.equal((await request(path + '/' + first.id, { method: 'PUT', raw: 'x'.repeat(65537) })).status, 413);
	const concurrent = await Promise.all(Array.from({ length: 8 }, (_, index) => create({ name: 'Concurrent', email: index % 2 ? 'RACE@EXAMPLE.NET' : 'race@example.net' })));
	assert.equal(concurrent.filter(response => response.status === 201).length, 1);
	assert.equal(concurrent.filter(response => response.status === 409).length, 7);
	const secondResponse = await create({ name: 'Bob', email: 'bob@example.net' });
	assert.equal(secondResponse.status, 201);
	const second = await secondResponse.json();
	assert.equal(second.notes, '');
	assert.equal(second.introduction, '');
	for (const q of ['ALICE', 'alice@example', '业务合作', '市场策略', '%', '_']) {
		const results = await list('?q=' + encodeURIComponent(q));
		assert.deepEqual(results.contacts.map(contact => contact.id), [first.id], q);
	}
	assert.equal((await list('?q=' + encodeURIComponent("' OR 1=1 --"))).totalCount, 0);
	for (const query of ['?page=0', '?page=-1', '?page=1.5', '?page=abc', '?page=', '?page=9007199254740991&limit=100', '?limit=0', '?limit=101', '?limit=2.5', '?limit=', '?q=' + 'x'.repeat(201)]) {
		assert.equal((await request(path + query)).status, 400, query);
	}
	const firstPage = await list('?page=1&limit=1');
	const secondPage = await list('?page=2&limit=1');
	assert.equal(firstPage.totalCount, 3);
	assert.equal(firstPage.contacts[0].id, first.id);
	assert.equal(secondPage.contacts[0].id, second.id);
	assert.deepEqual(await list('?page=1&limit=1'), firstPage, 'pagination order is stable');
	assert.deepEqual(await list('?page=100&limit=1'), { contacts: [], totalCount: 3 });
	assert.equal((await request(path + '/' + second.id, { method: 'PUT', body: { ...alice, email: ' ALICE@EXAMPLE.NET ' } })).status, 409);
	assert.equal((await list('?q=bob')).contacts[0].name, 'Bob', 'duplicate update preserves the original contact');
	const updateBody = { name: 'Updated Bob', email: ' NEWBOB@EXAMPLE.NET ', notes: 'updated', introduction: 'new intro' };
	const updatedResponse = await request(path + '/' + second.id, { method: 'PUT', body: updateBody });
	assert.equal(updatedResponse.status, 200);
	const updated = await updatedResponse.json();
	assert.equal(updated.id, second.id);
	assert.equal(updated.createdAt, second.createdAt);
	assert.ok(updated.updatedAt >= second.updatedAt);
	assert.equal(updated.email, 'newbob@example.net');
	assert.equal(updated.notes, updateBody.notes);
	assert.equal(updated.introduction, updateBody.introduction);
	assert.equal((await request(path + '/missing', { method: 'PUT', body: updateBody })).status, 404);
	assert.equal((await request(path + '/missing', { method: 'DELETE' })).status, 404);
	const deleted = await request(path + '/' + first.id, { method: 'DELETE' });
	assert.equal(deleted.status, 204);
	assert.equal(await deleted.text(), '');
	assert.equal((await list('?q=alice')).totalCount, 0);
	assert.equal((await request(path + '/' + first.id, { method: 'DELETE' })).status, 404);
	assert.equal((await create(alice)).status, 201, 'deleted email can be added again');
	const beforeRestart = await list();
	await mf.dispose();
	mf = new Miniflare(options);
	const unauthorized = await request(path, { cookie: null });
	assert.equal(unauthorized.status, 401);
	assert.equal(unauthorized.headers.get('cache-control'), 'no-store');
	assert.equal((await create(alice, null)).status, 401);
	assert.equal((await request(path + '?q=alice', { cookie })).status, 403, 'mailbox session remains denied after restart');
	assert.deepEqual(await list(), beforeRestart, 'contacts and existing admin session survive worker restart');
	const persistedBucket = await mf.getR2Bucket('BUCKET');
	assert.equal(await (await persistedBucket.get('mailboxes/member@example.com.json')).text(), legacySettings, 'contact storage never rewrites existing mailbox settings');
	console.log('PASS: admin-only contacts, mailbox GET/HEAD/search denial without data leaks, same-email role isolation, CSRF, no-store, field/body limits, normalization, duplicate races, CRUD, literal search, stable pagination, restart persistence and legacy mailbox isolation. No external network or email.');
} finally {
	await mf.dispose();
	await rm(dir, { recursive: true, force: true });
}
