import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'boipt-'));
process.env.DATA_DIR = dir;
process.env.TRUST_PROXY = '0';
// Registration is closed by default (see registration.test.js); these tests
// need an account, so this isolated data dir starts with it open.
fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ version: 1, registrationOpen: true }));

let server;
let base;

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

async function account() {
  const res = await fetch(`${base}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'server@example.com', password: 'een prima wachtwoord' }),
  });
  assert.equal(res.status, 201);
  return res.headers.get('set-cookie');
}

test('zonder cookie: 401 op voortgang en config', async () => {
  assert.equal((await fetch(`${base}/api/progress`)).status, 401);
  assert.equal((await fetch(`${base}/api/config`)).status, 401);
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
});

test('statische pagina laadt met veiligheidsheaders', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
});

test('account: cookie, en daarmee voortgang lezen en schrijven', async () => {
  const setCookie = await account();
  const cookie = setCookie.split(';')[0];
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);

  const put = await fetch(`${base}/api/progress`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ base: null, state: { achievements: [1, 2, 99999], marks: {}, counters: { greedDonation: 5, 'evil key!': 3 } } }),
  });
  assert.equal(put.status, 200);
  const saved = await put.json();
  assert.deepEqual(saved.achievements, [1, 2], 'onbekende ID valt weg');
  assert.deepEqual(saved.counters, { greedDonation: 5 }, 'rare sleutel valt weg');

  // Stale base: conflict instead of overwrite.
  const stale = await fetch(`${base}/api/progress`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ base: '2000-01-01T00:00:00.000Z', state: { achievements: [] } }),
  });
  assert.equal(stale.status, 409);
  assert.deepEqual((await stale.json()).current.achievements, [1, 2]);
});

test('save-upload: geen save = 400, te groot = 413', async () => {
  const res = await fetch(`${base}/api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'server@example.com', password: 'een prima wachtwoord' }),
  });
  const auth = { Authorization: `Bearer ${(await res.json()).token}` };
  const bad = await fetch(`${base}/api/save`, { method: 'POST', headers: auth, body: 'x'.repeat(200) });
  assert.equal(bad.status, 400);
  const big = await fetch(`${base}/api/save`, { method: 'POST', headers: auth, body: new Uint8Array(70 * 1024) });
  assert.equal(big.status, 413);
});
