// Eigen proces en datamap: verse oude voortgang, en meerdere accounts die
// tegelijk proberen hem over te nemen. Er mag er precies één winnen.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'boipt-race-'));
process.env.DATA_DIR = dir;
process.env.ACCESS_PIN = '987654';
process.env.TRUST_PROXY = '1';
process.env.STEAM_ID = '';
fs.writeFileSync(path.join(dir, 'progress.json'), JSON.stringify({ version: 1, achievements: [42], updatedAt: '2026-01-01T00:00:00.000Z' }));

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

async function register(i) {
  const res = await fetch(`${base}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.1.0.${i + 1}` },
    body: JSON.stringify({ email: `race${i}@example.com`, password: 'een prima wachtwoord' }),
  });
  assert.equal(res.status, 201);
  return res.headers.get('set-cookie').split(';')[0];
}

test('legacy: account met eigen voortgang wordt niet overschreven en verbruikt de claim niet', async () => {
  const cookie = await register(9);
  await fetch(`${base}/api/progress`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ base: null, state: { achievements: [1] } }),
  });
  const res = await fetch(`${base}/api/legacy/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie, 'X-Forwarded-For': '10.3.0.1' },
    body: JSON.stringify({ pin: '987654' }),
  });
  assert.equal(res.status, 409);
  assert.deepEqual((await (await fetch(`${base}/api/progress`, { headers: { cookie } })).json()).achievements, [1]);
  assert.equal((await (await fetch(`${base}/api/session`, { headers: { cookie } })).json()).legacy.available, true);
});

test('legacy: tegelijk claimen geeft precies één winnaar', async () => {
  const cookies = await Promise.all([0, 1, 2, 3, 4].map(register));
  const results = await Promise.all(cookies.map((cookie, i) => fetch(`${base}/api/legacy/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie, 'X-Forwarded-For': `10.2.0.${i + 1}` },
    body: JSON.stringify({ pin: '987654' }),
  }).then((r) => r.status)));
  assert.equal(results.filter((s) => s === 200).length, 1, String(results));
  assert.equal(results.filter((s) => s === 409).length, 4, String(results));

  const progress = await Promise.all(cookies.map((cookie) => fetch(`${base}/api/progress`, { headers: { cookie } }).then((r) => r.json())));
  const owners = progress.filter((p) => (p.achievements || []).includes(42));
  assert.equal(owners.length, 1);
});
