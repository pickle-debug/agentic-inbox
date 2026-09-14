import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';

const { privateKey, publicKey } = await generateKeyPair('RS256');
const publicJwk = { ...await exportJWK(publicKey), kid: 'test-key', alg: 'RS256', use: 'sig' };
const assertion = await new SignJWT({ email: 'admin@example.net', type: 'app' }).setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).setIssuer('https://test.cloudflareaccess.com').setAudience('test-audience').setExpirationTime('5m').sign(privateKey);
const dir = await mkdtemp(join(tmpdir(), 'inbox-auth-test-'));
await build({ entryPoints: ['tests/auth-worker.ts'], outfile: join(dir, 'worker.mjs'), bundle: true, format: 'esm', platform: 'node', external: ['cloudflare:*'], conditions: ['workerd', 'worker', 'browser'], define: { 'process.env.NODE_ENV': '"test"' } });
const options = { modules: true, modulesRoot: dir, scriptPath: join(dir, 'worker.mjs'), compatibilityDate: '2025-11-28', compatibilityFlags: ['nodejs_compat'], outboundService: request => request.url === 'https://test.cloudflareaccess.com/cdn-cgi/access/certs' ? Response.json({ keys: [publicJwk] }) : new Response('No network in tests', { status: 403 }), bindings: { DOMAINS: 'example.com', EMAIL_ADDRESSES: [], DEV_ADMIN_EMAIL: 'admin@example.net' }, r2Buckets: ['BUCKET'], durableObjects: { AUTH: { className: 'AuthStore', useSQLite: true }, MAILBOX: { className: 'MailboxDO', useSQLite: true }, EMAIL_AGENT: { className: 'EmailAgent', useSQLite: true } } };
const mf = new Miniflare(options);
const origin = 'https://mail.example.test';
const password = 'local-fixture-password-1234';
async function request(path, { method = 'GET', cookie, body, source = origin, headers = {} } = {}) {
 return mf.dispatchFetch(origin + path, { method, headers: { ...(method !== 'GET' ? { Origin: source, 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
}
const auth = await mf.getDurableObjectNamespace('AUTH');
const store = auth.get(auth.idFromName('auth'));
try {
 for (const email of ['contact@example.com', 'gidon@example.com']) {
  assert.equal((await request('/api/v1/mailboxes', { method: 'POST', body: { email, name: email } })).status, 201);
  assert.equal((await request(`/api/v1/mailboxes/${email}/login`, { method: 'PUT', body: { password } })).status, 200);
 }
 assert.equal((await request('/auth/login', { method: 'POST', source: 'https://other.test', body: { email: 'contact@example.com', password } })).status, 403);
 assert.equal((await request('/auth/login', { method: 'POST', body: { email: 'contact@example.com', password: 'incorrect' } })).status, 401);
 assert.equal((await request('/auth/login', { method: 'POST', body: { email: 'unknown@example.com', password } })).status, 401);
 const login = await request('/auth/login', { method: 'POST', body: { email: 'CONTACT@example.com', password } });
 assert.equal(login.status, 200);
 const setCookie = login.headers.get('set-cookie');
 assert.match(setCookie, /HttpOnly/i); assert.match(setCookie, /Secure/i); assert.match(setCookie, /SameSite=Strict/i);
 const cookie = setCookie.split(';')[0];
 assert.equal((await (await request('/auth/session', { cookie })).json()).role, 'mailbox');
 const mailboxes = await (await request('/api/v1/mailboxes', { cookie })).json();
 assert.deepEqual(mailboxes.map(m => m.email), ['contact@example.com']);
 assert.deepEqual(await (await request('/api/v1/config', { cookie })).json(), { domains: [], emailAddresses: [] });
 for (const suffix of ['', '/emails', '/settings', '/emails/test/attachments/test', '/login']) {
  assert.equal((await request('/api/v1/mailboxes/gidon@example.com' + suffix, { cookie })).status, 403, suffix);
 }
 assert.equal((await request('/api/v1/mailboxes/contact@example.com', { cookie })).status, 200);
 assert.equal((await request('/api/v1/mailboxes/contact@example.com/emails', { cookie })).status, 200);
 assert.equal((await request('/api/v1/mailboxes/contact@example.com', { cookie, method: 'DELETE' })).status, 403);
 assert.equal((await request('/api/v1/mailboxes/contact@example.com/login', { cookie })).status, 403);
 assert.equal((await request('/api/v1/mailboxes', { cookie, method: 'POST', body: { email: 'other@example.com', name: 'Other' } })).status, 403);
 assert.equal((await request('/mcp', { cookie })).status, 403);
 assert.equal((await request('/agents/email-agent/gidon%40example.com/get-messages', { cookie })).status, 403);
 assert.equal((await request('/agents/email-agent/contact%40example.com/onNewEmail', { cookie, method: 'POST', body: {} })).status, 404);
 const ws = await request('/agents/email-agent/contact%40example.com', { cookie, headers: { Upgrade: 'websocket', Origin: origin } });
 assert.equal(ws.status, 101);
 const socket = ws.webSocket;
 let closedCode;
 socket.addEventListener('close', event => { closedCode = event.code; });
 socket.accept();
 await new Promise(resolve => setTimeout(resolve, 100));
 assert.equal((await request('/api/v1/mailboxes/contact@example.com/login', { method: 'PUT', body: { password: password + '-new' } })).status, 200);
 assert.equal((await request('/api/v1/mailboxes', { cookie })).status, 401);
 for (let i = 0; i < 20 && closedCode === undefined; i++) await new Promise(resolve => setTimeout(resolve, 50));
 const agentNamespace = await mf.getDurableObjectNamespace('EMAIL_AGENT');
 const states = await agentNamespace.get(agentNamespace.idFromName('contact@example.com')).connectionStates();
 assert.ok(states.every(state => state !== 1), 'revoked server sockets must no longer be open');
 socket.close();
 assert.equal((await request('/auth/login', { method: 'POST', body: { email: 'contact@example.com', password } })).status, 401);
 const nextLogin = await request('/auth/login', { method: 'POST', body: { email: 'contact@example.com', password: password + '-new' } });
 const nextCookie = nextLogin.headers.get('set-cookie').split(';')[0];
 assert.equal((await request('/auth/logout', { method: 'POST', cookie: nextCookie })).status, 200);
 assert.equal((await request('/auth/session', { cookie: nextCookie })).status, 401);
 await request('/api/v1/mailboxes/contact@example.com/login', { method: 'DELETE' });
 assert.equal((await request('/auth/login', { method: 'POST', body: { email: 'contact@example.com', password: password + '-new' } })).status, 401);
 for (let i = 0; i < 10; i++) assert.equal((await store.login('rate@example.com', 'wrong-password', 'rate-ip')).error, 'invalid');
 assert.equal((await store.login('rate@example.com', 'wrong-password', 'rate-ip')).error, 'limited');
 // No plaintext credentials in mailbox settings or session keys in storage.
 const bucket = await mf.getR2Bucket('BUCKET');
 assert.ok(!(await (await bucket.get('mailboxes/contact@example.com.json')).text()).includes(password));
 await mf.setOptions({ ...options, bindings: { DOMAINS: 'example.com', EMAIL_ADDRESSES: [], POLICY_AUD: 'test-audience', TEAM_DOMAIN: 'https://test.cloudflareaccess.com', ADMIN_ORIGIN: origin } });
 assert.equal((await request('/api/v1/mailboxes')).status, 401);
 assert.equal((await request('/auth/session')).status, 401);
 assert.equal((await request('/mcp')).status, 401);
 assert.equal((await request('/agents/email-agent/contact@example.com')).status, 401);
 assert.equal((await request('/')).headers.get('location'), '/login');
 assert.equal((await request('/auth/config')).status, 200);
 assert.equal((await request('/auth/session', { headers: { 'cf-access-jwt-assertion': assertion } })).status, 200);
 assert.equal((await request('/mcp', { headers: { 'cf-access-jwt-assertion': assertion } })).status, 200);
 assert.equal((await request('/auth/session', { headers: { 'cf-access-jwt-assertion': assertion + 'bad' } })).status, 403);
 const badAudience = await new SignJWT({ email: 'admin@example.net', type: 'app' }).setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).setIssuer('https://test.cloudflareaccess.com').setAudience('other-app').setExpirationTime('5m').sign(privateKey);
 assert.equal((await request('/auth/session', { headers: { 'cf-access-jwt-assertion': badAudience } })).status, 403);
 const expired = await new SignJWT({ email: 'admin@example.net', type: 'app' }).setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).setIssuer('https://test.cloudflareaccess.com').setAudience('test-audience').setExpirationTime(1).sign(privateKey);
 assert.equal((await request('/auth/session', { headers: { 'cf-access-jwt-assertion': expired } })).status, 403);
 assert.equal((await request('/auth/session', { cookie, headers: { 'cf-access-jwt-assertion': assertion } })).status, 401, 'stale member cookie must not become administrator');
 assert.equal((await mf.dispatchFetch('https://public.example.test/auth/session', { headers: { 'cf-access-jwt-assertion': assertion } })).status, 401);

 // Single-origin callback exchanges Access identity for a scoped, opaque session.
 assert.equal((await (await request('/auth/config')).json()).adminLoginUrl, origin + '/auth/admin/session');
 for (const value of [null, assertion + 'bad', badAudience, expired]) {
  const rejected = await request('/auth/admin/session', { headers: value ? { 'cf-access-jwt-assertion': value } : {} });
  assert.equal(rejected.status, 403);
  assert.equal(rejected.headers.get('set-cookie'), null);
 }
 assert.equal((await mf.dispatchFetch('https://public.example.test/auth/admin/session', { headers: { 'cf-access-jwt-assertion': assertion } })).status, 403);
 const callback = await request('/auth/admin/session', { headers: { 'cf-access-jwt-assertion': assertion } });
 assert.equal(callback.status, 302);
 assert.equal(callback.headers.get('location'), '/');
 const adminCookie = callback.headers.get('set-cookie').split(';')[0];
 assert.match(callback.headers.get('set-cookie'), /HttpOnly/i);
 assert.match(callback.headers.get('set-cookie'), /Secure/i);
 assert.match(callback.headers.get('set-cookie'), /SameSite=Strict/i);
 assert.ok(Number(callback.headers.get('set-cookie').match(/Max-Age=(\d+)/i)[1]) <= 300);
 const adminIdentity = await (await request('/auth/session', { cookie: adminCookie })).json();
 assert.equal(adminIdentity.role, 'admin');
 assert.equal(adminIdentity.email, 'admin@example.net');
 assert.equal((await (await request('/api/v1/mailboxes', { cookie: adminCookie })).json()).length, 2);
 assert.equal((await request('/api/v1/mailboxes/gidon@example.com/login', { cookie: adminCookie, method: 'PUT', body: { password } })).status, 200);
 assert.equal((await request('/mcp', { cookie: adminCookie, method: 'POST', source: '' })).status, 403);
 const adminSocketResponse = await request('/agents/email-agent/gidon@example.com', { cookie: adminCookie, headers: { Upgrade: 'websocket', Origin: origin } });
 assert.equal(adminSocketResponse.status, 101);
 const adminSocket = adminSocketResponse.webSocket;
 adminSocket.accept();
 await new Promise(resolve => setTimeout(resolve, 100));
 const logout = await request('/auth/logout', { cookie: adminCookie, method: 'POST' });
 assert.equal((await logout.json()).redirect, '/cdn-cgi/access/logout');
 assert.equal((await request('/auth/session', { cookie: adminCookie })).status, 401);
 const namespace = await mf.getDurableObjectNamespace('EMAIL_AGENT');
 const agent = namespace.get(namespace.idFromName('gidon@example.com'));
 await agent.emitTestUpdate();
 await new Promise(resolve => setTimeout(resolve, 100));
 assert.ok((await agent.connectionStates()).every(state => state !== 1));
 adminSocket.close();
 // Switching from admin to password identity revokes the old admin session.
 const second = await request('/auth/admin/session', { headers: { 'cf-access-jwt-assertion': assertion } });
 const secondCookie = second.headers.get('set-cookie').split(';')[0];
 const memberLogin = await request('/auth/login', { cookie: secondCookie, method: 'POST', body: { email: 'gidon@example.com', password, role: 'admin' } });
 assert.equal(memberLogin.status, 200);
 const memberCookie = memberLogin.headers.get('set-cookie').split(';')[0];
 assert.equal((await request('/auth/session', { cookie: secondCookie })).status, 401);
 assert.equal((await (await request('/auth/session', { cookie: memberCookie })).json()).role, 'mailbox');
 assert.equal((await request('/auth/admin/session', { cookie: memberCookie })).status, 403);
 const switchBack = await request('/auth/admin/session', { cookie: memberCookie, headers: { 'cf-access-jwt-assertion': assertion } });
 assert.equal(switchBack.status, 302);
 assert.equal((await request('/auth/session', { cookie: memberCookie })).status, 401);

 // Existing three-column session tables upgrade with mailbox-only privileges.
 const currentAuth = await mf.getDurableObjectNamespace('AUTH');
 const currentStore = currentAuth.get(currentAuth.idFromName('auth'));
 const capped = await currentStore.adminSession('admin@example.net', Date.now() + 24 * 3600_000);
 assert.ok(capped.maxAge <= 8 * 3600);
 await assert.rejects(currentStore.adminSession('admin@example.net', Date.now() - 1));
 const legacyToken = 'a'.repeat(64);
 await currentStore.seedLegacySession(legacyToken);
 await mf.setOptions(options);
 const upgradedAuth = await mf.getDurableObjectNamespace('AUTH');
 const upgradedStore = upgradedAuth.get(upgradedAuth.idFromName('auth'));
 const legacySession = await upgradedStore.session(legacyToken);
 assert.equal(legacySession.role, 'mailbox');
 assert.equal(legacySession.email, 'gidon@example.com');
 assert.equal((await request('/api/v1/mailboxes/contact@example.com', { cookie: '__Host-inbox_session=' + legacyToken })).status, 403);
 const afterMigration = await upgradedStore.adminSession('admin@example.net', Date.now() + 60_000);
 assert.equal((await upgradedStore.session(afterMigration.token)).role, 'admin');
 console.log('PASS: legacy-session migration, single-origin admin exchange, expiry cap, role switching, admin logout and agent revocation, password login, CSRF, mailbox isolation, attachments, admin-only controls, MCP denial, agent scoping, reset/socket revocation, logout, disable, rate limit.');
} finally { await mf.dispose(); await rm(dir, { recursive: true, force: true }); }
