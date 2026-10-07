// JSON-bestanden atomisch schrijven (tijdelijk bestand, dan hernoemen), één
// schrijfactie tegelijk per bestand, en alleen leesbaar voor de eigenaar.

import fs from 'node:fs/promises';
import fss from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const queues = new Map();

export function readJsonSync(file, fallback) {
  try {
    return JSON.parse(fss.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

export async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

// De inhoud wordt meteen vastgelegd; de schrijfacties lopen in volgorde.
export function writeJson(file, data) {
  const text = JSON.stringify(data);
  const prev = queues.get(file) || Promise.resolve();
  const next = prev.catch(() => {}).then(async () => {
    await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    try {
      await fs.writeFile(tmp, text, { mode: 0o600 });
      await fs.rename(tmp, file);
    } catch (err) {
      await fs.rm(tmp, { force: true });
      throw err;
    }
  });
  queues.set(file, next);
  next.finally(() => { if (queues.get(file) === next) queues.delete(file); }).catch(() => {});
  return next;
}

// Eenvoudige mutex per sleutel: lezen-vergelijken-schrijven zonder dat een
// tweede verzoek ertussen komt.
const locks = new Map();
export function withLock(key, fn) {
  const prev = locks.get(key) || Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  const tail = run.catch(() => {});
  locks.set(key, tail);
  tail.then(() => { if (locks.get(key) === tail) locks.delete(key); });
  return run;
}
