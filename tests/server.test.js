import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'boipt-'));
process.env.DATA_DIR = dir;
process.env.ACCESS_PIN = '4242';
process.env.TRUST_PROXY = '0';
process.env.STEAM_ID = '76561197960287930';

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

const login = (pin) => fetch(`${base}/api/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ pin }),
});

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

test('goede PIN: cookie, en daarmee voortgang lezen en schrijven', async () => {
  const res = await login('4242');
  assert.equal(res.status, 200);
  const cookie = res.headers.get('set-cookie').split(';')[0];
  assert.match(res.headers.get('set-cookie'), /HttpOnly/);
  assert.match(res.headers.get('set-cookie'), /SameSite=Strict/);

  const put = await fetch(`${base}/api/progress`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ base: null, state: { achievements: [1, 2, 99999], marks: {}, counters: { greedDonation: 5, 'evil key!': 3 } } }),
  });
  assert.equal(put.status, 200);
  const saved = await put.json();
  assert.deepEqual(saved.achievements, [1, 2], 'onbekende ID valt weg');
  assert.deepEqual(saved.counters, { greedDonation: 5 }, 'rare sleutel valt weg');

  // Oude basis: conflict in plaats van overschrijven.
  const stale = await fetch(`${base}/api/progress`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ base: '2000-01-01T00:00:00.000Z', state: { achievements: [] } }),
  });
  assert.equal(stale.status, 409);
  assert.deepEqual((await stale.json()).current.achievements, [1, 2]);

  const cfg = await (await fetch(`${base}/api/config`, { headers: { cookie } })).json();
  assert.equal(cfg.accountId, '22202');
});

test('save-upload: geen save = 400, te groot = 413', async () => {
  const auth = { Authorization: 'Bearer 4242' };
  const bad = await fetch(`${base}/api/save`, { method: 'POST', headers: auth, body: 'x'.repeat(200) });
  assert.equal(bad.status, 400);
  const big = await fetch(`${base}/api/save`, { method: 'POST', headers: auth, body: new Uint8Array(70 * 1024) });
  assert.equal(big.status, 413);
});

test('na 5 foute PINs: 429', async () => {
  const codes = [];
  for (let i = 0; i < 6; i++) codes.push((await login('0000')).status);
  assert.deepEqual(codes.slice(0, 5), [401, 401, 401, 401, 401]);
  assert.equal(codes[5], 429);
});
