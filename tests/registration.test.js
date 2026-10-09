// Registration: closed by default, only the admin (ADMIN_EMAIL) opens or closes
// it, and sign-up attempts are rate-limited per IP, even while it is closed.
// This directory starts without settings.json: exactly the production default.
// The tests build on each other (one setting per process) and run in order.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'boipt-reg-'));
process.env.DATA_DIR = dir;
process.env.TRUST_PROXY = '1';
process.env.ADMIN_EMAIL = ' Admin@Example.com ';
const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin test password 1';
process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;

const PASSWORD = 'correct horse battery';

let server;
let base;
let admin;
let bootstrap;
let ipSeq = 1;
const freshIp = () => `10.1.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`;

before(async () => {
  admin = await import('../server/admin.js');
  bootstrap = await admin.bootstrapAdmin();
  const { createApp } = await import('../server/index.js');
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

function call(p, { method = 'GET', body, cookie, bearer, ip = freshIp() } = {}) {
  const h = { 'X-Forwarded-For': ip };
  if (body !== undefined) h['Content-Type'] = 'application/json';
  if (cookie) h.cookie = cookie;
  if (bearer) h.Authorization = `Bearer ${bearer}`;
  return fetch(`${base}/api${p}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
}

const cookieOf = (res) => res.headers.get('set-cookie')?.split(';')[0];
const register = (email, ip) => call('/register', { method: 'POST', body: { email, password: PASSWORD }, ip });
const setOpen = (cookie, registrationOpen) => call('/admin/settings', { method: 'PUT', cookie, body: { registrationOpen } });

async function login(email, password) {
  const res = await call('/login', { method: 'POST', body: { email, password } });
  assert.equal(res.status, 200, await res.clone().text());
  return cookieOf(res);
}

const registrationOpen = async () => (await (await call('/session')).json()).registrationOpen;

// ---------- Admin account ----------

test('bootstrapAdmin: maakt het admin-account eenmalig uit ADMIN_PASSWORD en wist het uit env', async () => {
  assert.equal(bootstrap, 'created');
  assert.equal(process.env.ADMIN_PASSWORD, undefined);
  const raw = fs.readFileSync(path.join(dir, 'users.json'), 'utf8');
  assert.ok(raw.includes(ADMIN_EMAIL));
  assert.ok(!raw.includes(ADMIN_PASSWORD), 'alleen de hash staat op schijf');
  // Second start: already exists, any password is ignored.
  assert.equal(await admin.bootstrapAdmin({ password: 'een ander wachtwoord' }), 'exists');
});

test('bootstrapAdmin: uit, ongeldig adres, geen of zwak wachtwoord maakt niets aan', async () => {
  assert.equal(await admin.bootstrapAdmin({ email: '', password: ADMIN_PASSWORD }), 'disabled');
  assert.equal(await admin.bootstrapAdmin({ email: 'geen-email', password: ADMIN_PASSWORD }), 'invalid-email');
  assert.equal(await admin.bootstrapAdmin({ email: 'nieuw-admin@example.com', password: undefined }), 'missing-password');
  assert.equal(await admin.bootstrapAdmin({ email: 'nieuw-admin@example.com', password: 'kort' }), 'weak-password');
  const raw = fs.readFileSync(path.join(dir, 'users.json'), 'utf8');
  assert.ok(!raw.includes('nieuw-admin@example.com'));
});

// ---------- Closed by default ----------

test('registratie staat standaard dicht: 403, geen cookie, geen account', async () => {
  assert.equal(admin.getSettings().registrationOpen, false);
  assert.equal(await registrationOpen(), false);
  const res = await register('vroeg@example.com');
  assert.equal(res.status, 403);
  assert.equal(res.headers.get('set-cookie'), null);
  assert.match((await res.json()).error, /not being accepted/);
  assert.ok(!fs.readFileSync(path.join(dir, 'users.json'), 'utf8').includes('vroeg@example.com'));
  assert.ok(!fs.existsSync(path.join(dir, 'settings.json')), 'niets weggeschreven zolang niemand iets wijzigt');
});

test('dicht: ook een ongeldig verzoek krijgt 403 (dicht gaat voor alles)', async () => {
  assert.equal((await call('/register', { method: 'POST', body: {} })).status, 403);
});

test('dicht: bestaande accounts kunnen gewoon inloggen', async () => {
  const cookie = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  const session = await (await call('/session', { cookie })).json();
  assert.equal(session.authed, true);
  assert.deepEqual(session.user, { email: ADMIN_EMAIL, admin: true });
  assert.equal(session.registrationOpen, false);
});

// ---------- Admin toggle ----------

test('admin-instellingen: zonder login 401', async () => {
  assert.equal((await call('/admin/settings')).status, 401);
  assert.equal((await call('/admin/settings', { method: 'PUT', body: { registrationOpen: true } })).status, 401);
  assert.equal(await registrationOpen(), false);
});

test('admin-instellingen: alleen true of false', async () => {
  const cookie = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  for (const registrationOpen of ['yes', 1, null]) {
    assert.equal((await setOpen(cookie, registrationOpen)).status, 400, JSON.stringify(registrationOpen));
  }
  assert.equal((await call('/admin/settings', { method: 'PUT', cookie, body: {} })).status, 400);
  assert.equal(admin.getSettings().registrationOpen, false);
});

test('admin opent registratie: nieuwe accounts kunnen zich aanmelden, instelling staat op schijf', async () => {
  const cookie = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  assert.deepEqual(await (await call('/admin/settings', { cookie })).json(), { registrationOpen: false });
  const res = await setOpen(cookie, true);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { registrationOpen: true });
  assert.equal(await registrationOpen(), true);

  const reg = await register('speler@example.com');
  assert.equal(reg.status, 201, await reg.clone().text());
  assert.ok(cookieOf(reg));

  const file = path.join(dir, 'settings.json');
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).registrationOpen, true);
  assert.equal(fs.statSync(file).mode & 0o077, 0, 'settings.json niet leesbaar voor anderen');
});

test('open: het admin-adres kan niet via sign-up worden aangemaakt of overgenomen', async () => {
  assert.equal(await registrationOpen(), true);
  for (const email of [ADMIN_EMAIL, 'ADMIN@example.com']) {
    const res = await register(email);
    assert.equal(res.status, 403, email);
    assert.equal(res.headers.get('set-cookie'), null);
  }
});

test('gewone accounts zijn geen admin en kunnen niets aan de instellingen veranderen', async () => {
  const cookie = await login('speler@example.com', PASSWORD);
  const session = await (await call('/session', { cookie })).json();
  assert.equal(session.user.admin, false);
  assert.equal((await call('/admin/settings', { cookie })).status, 403);
  assert.equal((await setOpen(cookie, false)).status, 403);
  assert.equal(admin.getSettings().registrationOpen, true);
});

test('een sync-token van de admin kan de instellingen niet veranderen', async () => {
  const tok = await call('/token', { method: 'POST', body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, label: 'test' } });
  assert.equal(tok.status, 201);
  const { token } = await tok.json();
  assert.equal((await call('/admin/settings', { bearer: token })).status, 403);
  assert.equal((await call('/admin/settings', { method: 'PUT', bearer: token, body: { registrationOpen: false } })).status, 403);
  assert.equal(admin.getSettings().registrationOpen, true);
});

test('admin sluit registratie weer: nieuwe aanmeldingen 403, bestaande accounts blijven werken', async () => {
  const cookie = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  const res = await setOpen(cookie, false);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { registrationOpen: false });
  assert.equal(await registrationOpen(), false);
  assert.equal((await register('te-laat@example.com')).status, 403);
  assert.ok(await login('speler@example.com', PASSWORD));
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8')).registrationOpen, false);
});

// ---------- Rate limit ----------

test('rate limit: 10 sign-up-pogingen per IP per uur, ook terwijl registratie dicht is', async () => {
  assert.equal(await registrationOpen(), false);
  const ip = freshIp();
  const codes = [];
  for (let i = 0; i < 11; i++) codes.push((await register(`dicht${i}@example.com`, ip)).status);
  assert.deepEqual(codes.slice(0, 10), Array(10).fill(403));
  assert.equal(codes[10], 429);
  // Another IP is not affected.
  assert.equal((await register('ander-ip@example.com')).status, 403);
});

test('rate limit: ook bij open registratie telt elke poging, geslaagd of niet', async () => {
  const cookie = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  assert.equal((await setOpen(cookie, true)).status, 200);
  const ip = freshIp();
  const codes = [];
  codes.push((await register('limiet@example.com', ip)).status);
  for (let i = 0; i < 9; i++) codes.push((await call('/register', { method: 'POST', body: { email: `zwak${i}@example.com`, password: 'kort' }, ip })).status);
  const blocked = await register('limiet2@example.com', ip);
  assert.equal(codes[0], 201);
  assert.deepEqual(codes.slice(1), Array(9).fill(400));
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('set-cookie'), null);
  assert.ok(!fs.readFileSync(path.join(dir, 'users.json'), 'utf8').includes('limiet2@example.com'));
  assert.equal((await setOpen(cookie, false)).status, 200);
});
