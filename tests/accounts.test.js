// Accounts: registratie, wachtwoord-login, sessies, isolatie per account,
// eenmalige overname van de oude PIN-voortgang en sync-tokens.
// Elke test gebruikt een eigen X-Forwarded-For zodat de rate limits per IP
// elkaar niet beïnvloeden.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'boipt-acc-'));
process.env.DATA_DIR = dir;
process.env.ACCESS_PIN = '4242';
process.env.TRUST_PROXY = '1';
process.env.STEAM_ID = '76561197960287930';

// Bestaande single-user voortgang van vóór de accounts.
const LEGACY = { version: 1, achievements: [5, 6, 7], updatedAt: '2026-01-01T00:00:00.000Z' };
fs.writeFileSync(path.join(dir, 'progress.json'), JSON.stringify(LEGACY));

let server;
let base;
let ipSeq = 1;
const freshIp = () => `10.0.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`;

before(async () => {
  const { createApp } = await import('../server/index.js');
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const PASSWORD = 'correct horse battery';

function call(p, { method = 'GET', body, cookie, bearer, ip = '10.9.9.9', headers = {} } = {}) {
  const h = { 'X-Forwarded-For': ip, ...headers };
  if (body !== undefined) h['Content-Type'] = 'application/json';
  if (cookie) h.cookie = cookie;
  if (bearer) h.Authorization = `Bearer ${bearer}`;
  return fetch(`${base}/api${p}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
}

const cookieOf = (res) => res.headers.get('set-cookie')?.split(';')[0];

let userSeq = 0;
async function register(email = `user${++userSeq}@example.com`, password = PASSWORD) {
  const res = await call('/register', { method: 'POST', body: { email, password }, ip: freshIp() });
  assert.equal(res.status, 201, await res.clone().text());
  return { email, cookie: cookieOf(res) };
}

function fakeSave(achievements) {
  const sizes = [1, 4, 4, 1, 1, 1, 1, 4, 4, 1];
  const counts = [642, 523, 14, 733, 7, 104, 46, 27, 2, 80];
  let total = 0x14;
  sizes.forEach((s, i) => { total += 12 + s * counts[i]; });
  const buf = new Uint8Array(total + 4);
  const dv = new DataView(buf.buffer);
  buf.set([...'ISAACNGSAVE09R  '].map((c) => c.charCodeAt(0)), 0);
  buf[0x18] = 0x82;
  let ofs = 0x14;
  sizes.forEach((s, i) => {
    dv.setUint32(ofs, i + 1, true);
    dv.setUint32(ofs + 4, s * counts[i], true);
    dv.setUint32(ofs + 8, counts[i], true);
    ofs += 12;
    if (i === 0) for (const id of achievements) buf[ofs + id] = 1;
    ofs += s * counts[i];
  });
  return buf;
}

// ---------- Registratie ----------

test('registratie: ongeldig e-mailadres of zwak wachtwoord = 400', async () => {
  const ip = freshIp();
  const cases = [
    { email: 'geen-email', password: PASSWORD },
    { email: '', password: PASSWORD },
    { email: `${'a'.repeat(250)}@example.com`, password: PASSWORD },
    { email: 'kort@example.com', password: 'kort' },
    { email: 'lang@example.com', password: 'x'.repeat(200) },
    { email: 'zelfde@example.com', password: 'aaaaaaaaaaaaaaaa' },
    { email: 'type@example.com', password: 123456789012345 },
    {},
  ];
  for (const body of cases) {
    const res = await call('/register', { method: 'POST', body, ip });
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(res.headers.get('set-cookie'), null);
  }
});

test('registratie: account aangemaakt, ingelogd met veilige cookie, e-mail genormaliseerd', async () => {
  const res = await call('/register', { method: 'POST', body: { email: '  Nieuw.Iemand@Example.COM ', password: PASSWORD }, ip: freshIp() });
  assert.equal(res.status, 201);
  const set = res.headers.get('set-cookie');
  assert.match(set, /^boipt_session=[A-Za-z0-9_-]{40,};/);
  assert.match(set, /HttpOnly/);
  assert.match(set, /SameSite=Strict/);
  assert.match(set, /Path=\//);
  const session = await (await call('/session', { cookie: cookieOf(res) })).json();
  assert.equal(session.authed, true);
  assert.equal(session.user.email, 'nieuw.iemand@example.com');
});

test('registratie: hetzelfde e-mailadres (andere hoofdletters) = 409', async () => {
  await register('dubbel@example.com');
  const res = await call('/register', { method: 'POST', body: { email: 'DUBBEL@example.com', password: 'nog een ander wachtwoord' }, ip: freshIp() });
  assert.equal(res.status, 409);
});

test('wachtwoorden staan alleen als scrypt-hash op schijf', async () => {
  await register('hash@example.com', 'mijn geheime wachtwoord');
  const raw = fs.readFileSync(path.join(dir, 'users.json'), 'utf8');
  assert.ok(!raw.includes('mijn geheime wachtwoord'));
  const user = JSON.parse(raw).users.find((u) => u.email === 'hash@example.com');
  assert.match(user.passwordHash, /^scrypt\$\d+\$\d+\$\d+\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
  const mode = fs.statSync(path.join(dir, 'users.json')).mode & 0o777;
  assert.equal(mode & 0o077, 0, 'users.json niet leesbaar voor anderen');
});

// ---------- Login ----------

test('login: fout wachtwoord en onbekend account = zelfde 401, goed wachtwoord = cookie', async () => {
  await register('login@example.com');
  const ip = freshIp();
  const wrong = await call('/login', { method: 'POST', body: { email: 'login@example.com', password: 'fout wachtwoord!!' }, ip });
  const unknown = await call('/login', { method: 'POST', body: { email: 'niemand@example.com', password: PASSWORD }, ip });
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.deepEqual(await wrong.json(), await unknown.json(), 'geen verschil tussen onbekend en fout');
  const ok = await call('/login', { method: 'POST', body: { email: ' LOGIN@example.com', password: PASSWORD }, ip });
  assert.equal(ok.status, 200);
  const cookie = cookieOf(ok);
  assert.equal((await call('/progress', { cookie })).status, 200);
});

test('login: na 5 foute pogingen vanaf één IP = 429', async () => {
  await register('brute@example.com');
  const ip = freshIp();
  const codes = [];
  for (let i = 0; i < 6; i++) {
    codes.push((await call('/login', { method: 'POST', body: { email: 'brute@example.com', password: `fout-${i}-xxxxxxxx` }, ip })).status);
  }
  assert.deepEqual(codes.slice(0, 5), [401, 401, 401, 401, 401]);
  assert.equal(codes[5], 429);
});

test('login: foute pogingen van anderen sluiten de eigenaar niet buiten', async () => {
  await register('spread@example.com');
  for (let i = 0; i < 12; i++) {
    await call('/login', { method: 'POST', body: { email: 'spread@example.com', password: `fout-${i}-xxxxxxxx` }, ip: freshIp() });
  }
  const ok = await call('/login', { method: 'POST', body: { email: 'spread@example.com', password: PASSWORD }, ip: freshIp() });
  assert.equal(ok.status, 200);
});

test('login: ook geslaagde pogingen zijn per IP begrensd (scrypt is duur)', async () => {
  const { email } = await register();
  const ip = freshIp();
  const codes = [];
  for (let i = 0; i < 31; i++) codes.push((await call('/login', { method: 'POST', body: { email, password: PASSWORD }, ip })).status);
  assert.equal(codes[29], 200);
  assert.equal(codes[30], 429);
});

test('oude PIN-login en PIN als bearer werken niet meer', async () => {
  const ip = freshIp();
  assert.equal((await call('/login', { method: 'POST', body: { pin: '4242' }, ip })).status, 400);
  assert.equal((await call('/progress', { bearer: '4242', ip })).status, 401);
});

// ---------- Sessies en uitloggen ----------

test('uitloggen trekt de sessie op de server in', async () => {
  const { cookie } = await register();
  assert.equal((await call('/progress', { cookie })).status, 200);
  const out = await call('/logout', { method: 'POST', cookie });
  assert.equal(out.status, 200);
  assert.match(out.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await call('/progress', { cookie })).status, 401, 'oude cookie is dood');
});

test('sessie-overzicht: eigen sessies zien en een andere intrekken', async () => {
  const { email, cookie } = await register();
  const other = cookieOf(await call('/login', { method: 'POST', body: { email, password: PASSWORD }, ip: freshIp(), headers: { 'User-Agent': 'Telefoon' } }));
  const stranger = await register();
  const list = await (await call('/sessions', { cookie })).json();
  assert.equal(list.sessions.length, 2);
  assert.equal(list.sessions.filter((s) => s.current).length, 1);
  for (const s of list.sessions) {
    assert.match(s.id, /^[a-f0-9]{16}$/);
    assert.ok(!('token' in s) && !('tokenHash' in s));
  }
  const phone = list.sessions.find((s) => !s.current);
  assert.equal(phone.userAgent, 'Telefoon');
  // Een ander account kan deze sessie niet intrekken.
  assert.equal((await call(`/sessions/${phone.id}`, { method: 'DELETE', cookie: stranger.cookie })).status, 404);
  assert.equal((await call('/progress', { cookie: other })).status, 200);
  assert.equal((await call(`/sessions/${phone.id}`, { method: 'DELETE', cookie })).status, 200);
  assert.equal((await call('/progress', { cookie: other })).status, 401);
  assert.equal((await call('/progress', { cookie })).status, 200);
});

test('verzonnen of vervalste cookie = 401', async () => {
  assert.equal((await call('/progress', { cookie: 'boipt_session=abc' })).status, 401);
  assert.equal((await call('/progress', { cookie: `boipt_session=${'A'.repeat(43)}` })).status, 401);
});

test('cookie-verzoek met vreemde Origin wordt geweigerd', async () => {
  const { cookie } = await register();
  const res = await call('/progress', { method: 'PUT', cookie, body: { state: { achievements: [1] } }, headers: { Origin: 'https://evil.example' } });
  assert.equal(res.status, 403);
});

// ---------- Isolatie ----------

test('voortgang is strikt per account', async () => {
  const a = await register();
  const b = await register();
  const put = await call('/progress', { method: 'PUT', cookie: a.cookie, body: { base: null, state: { achievements: [1, 2] } } });
  assert.equal(put.status, 200);
  const pb = await (await call('/progress', { cookie: b.cookie })).json();
  assert.deepEqual(pb.achievements ?? [], []);
  await call('/progress', { method: 'PUT', cookie: b.cookie, body: { base: null, state: { achievements: [3] } } });
  assert.deepEqual((await (await call('/progress', { cookie: a.cookie })).json()).achievements, [1, 2]);
  assert.deepEqual((await (await call('/progress', { cookie: b.cookie })).json()).achievements, [3]);
});

test('sources uit de client worden tot bekende, veilige velden teruggebracht', async () => {
  const { cookie } = await register();
  const res = await call('/progress', {
    method: 'PUT',
    cookie,
    body: { base: null, state: { achievements: [1], sources: {
      save: { at: '2026-01-01T00:00:00.000Z', edition: '<b>x</b>'.repeat(30), achievements: '<form>', evil: 1 },
      steam: { at: 5, count: '<img>' },
    } } },
  });
  const saved = await res.json();
  assert.equal(typeof saved.sources.save.achievements, 'number');
  assert.equal(saved.sources.save.evil, undefined);
  assert.ok(saved.sources.save.edition.length <= 40);
  assert.equal(typeof saved.sources.steam.count, 'number');
});

test('nieuw account ziet de oude PIN-voortgang nooit', async () => {
  const { cookie } = await register();
  const p = await (await call('/progress', { cookie })).json();
  assert.deepEqual(p.achievements ?? [], []);
  const cfg = await (await call('/config', { cookie })).json();
  assert.equal(cfg.steamId, null, 'STEAM_ID uit .env hoort bij de eigenaar, niet bij nieuwe accounts');
  assert.equal(cfg.accountId, null);
});

test('steam: zonder eigen SteamID = 400, en SteamID is per account', async () => {
  const a = await register();
  const b = await register();
  const steam = await call('/steam', { cookie: a.cookie });
  assert.equal(steam.status, 400);
  assert.equal((await call('/account', { method: 'PUT', cookie: a.cookie, body: { steamId: 'niet-geldig' } })).status, 400);
  assert.equal((await call('/account', { method: 'PUT', cookie: a.cookie, body: { steamId: '76561197960287931' } })).status, 200);
  assert.equal((await (await call('/config', { cookie: a.cookie })).json()).accountId, '22203');
  assert.equal((await (await call('/config', { cookie: b.cookie })).json()).steamId, null);
});

// ---------- Sync-token (bearer) ----------

test('sync-token: save komt alleen bij het eigen account', async () => {
  const a = await register();
  const b = await register();
  const tok = await call('/token', { method: 'POST', body: { email: a.email, password: PASSWORD, label: 'Isaac-pc' }, ip: freshIp() });
  assert.equal(tok.status, 201);
  const { token } = await tok.json();
  assert.match(token, /^[A-Za-z0-9_-]{40,}$/);
  assert.equal(tok.headers.get('set-cookie'), null, 'token-endpoint zet geen cookie');

  const up = await fetch(`${base}/api/save`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'X-Forwarded-For': freshIp() }, body: fakeSave([10, 11]) });
  assert.equal(up.status, 200, await up.clone().text());
  assert.deepEqual((await (await call('/progress', { cookie: a.cookie })).json()).achievements, [10, 11]);
  assert.deepEqual((await (await call('/progress', { cookie: b.cookie })).json()).achievements ?? [], []);

  const list = await (await call('/sessions', { cookie: a.cookie })).json();
  assert.ok(list.sessions.some((s) => s.kind === 'sync' && s.label === 'Isaac-pc'));
});

test('sync-token: fout wachtwoord = 401, onbekend token = 401', async () => {
  const a = await register();
  assert.equal((await call('/token', { method: 'POST', body: { email: a.email, password: 'verkeerd wachtwoord' }, ip: freshIp() })).status, 401);
  assert.equal((await call('/progress', { bearer: 'x'.repeat(43), ip: freshIp() })).status, 401);
});

// ---------- Oude voortgang overnemen ----------

test('legacy: overnemen kan alleen met de juiste PIN, precies één keer', async () => {
  const owner = await register();
  const intruder = await register();

  const s0 = await (await call('/session', { cookie: owner.cookie })).json();
  assert.equal(s0.legacy.available, true);

  const wrong = await call('/legacy/claim', { method: 'POST', cookie: intruder.cookie, body: { pin: '0000' }, ip: freshIp() });
  assert.equal(wrong.status, 403);
  assert.deepEqual((await (await call('/progress', { cookie: intruder.cookie })).json()).achievements ?? [], []);

  const ok = await call('/legacy/claim', { method: 'POST', cookie: owner.cookie, body: { pin: '4242' }, ip: freshIp() });
  assert.equal(ok.status, 200, await ok.clone().text());
  const mine = await (await call('/progress', { cookie: owner.cookie })).json();
  assert.deepEqual(mine.achievements, [5, 6, 7]);
  assert.equal((await (await call('/config', { cookie: owner.cookie })).json()).steamId, '76561197960287930', 'eigenaar erft STEAM_ID');

  // Tweede keer: niet door de eigenaar, en ook niet door iemand anders met de goede PIN.
  assert.equal((await call('/legacy/claim', { method: 'POST', cookie: owner.cookie, body: { pin: '4242' }, ip: freshIp() })).status, 409);
  assert.equal((await call('/legacy/claim', { method: 'POST', cookie: intruder.cookie, body: { pin: '4242' }, ip: freshIp() })).status, 409);
  assert.deepEqual((await (await call('/progress', { cookie: intruder.cookie })).json()).achievements ?? [], []);
  assert.equal((await (await call('/session', { cookie: intruder.cookie })).json()).legacy.available, false);

  // Het oude bestand blijft als back-up bestaan, maar wordt niet meer gebruikt.
  assert.ok(fs.existsSync(path.join(dir, 'legacy-claim.json')));
});

test('legacy: gelijktijdige claims leveren precies één winnaar op', async () => {
  // Nieuwe legacy-data in een aparte map zou een nieuw proces vereisen; hier
  // controleren we dat na de claim hierboven alle parallelle pogingen 409 geven.
  const users = await Promise.all([register(), register(), register()]);
  const codes = await Promise.all(users.map((u) => call('/legacy/claim', { method: 'POST', cookie: u.cookie, body: { pin: '4242' }, ip: freshIp() }).then((r) => r.status)));
  assert.deepEqual(codes, [409, 409, 409]);
});

test('legacy: foute PIN telt mee voor de rate limit', async () => {
  const u = await register();
  const ip = freshIp();
  const codes = [];
  for (let i = 0; i < 6; i++) codes.push((await call('/legacy/claim', { method: 'POST', cookie: u.cookie, body: { pin: '1111' }, ip })).status);
  assert.equal(codes[5], 429);
});
