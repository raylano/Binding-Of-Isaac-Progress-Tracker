// Voortgang als één JSON-bestand in de datamap. Schrijven gaat atomisch
// (eerst een tijdelijk bestand, dan hernoemen) zodat een crash halverwege nooit
// een half bestand achterlaat.

import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { normalizeState, serializeState } from '../web/js/logic.js';

const FILE = path.join(config.dataDir, 'progress.json');
let queue = Promise.resolve();

export async function readProgress() {
  try {
    return JSON.parse(await fs.readFile(FILE, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

// Alles wat binnenkomt gaat door normalizeState: onbekende velden vallen weg,
// getallen worden begrensd. Zo kan een client geen rommel in het bestand zetten.
export function sanitize(raw, maxId) {
  const s = normalizeState(raw);
  s.achievements = new Set([...s.achievements].filter((id) => Number.isInteger(id) && id <= maxId));
  s.manual = new Set([...s.manual].filter((id) => s.achievements.has(id)));
  const counters = {};
  for (const [k, v] of Object.entries(s.counters)) {
    if (/^[a-zA-Z]{1,40}$/.test(k) && Number.isFinite(Number(v))) counters[k] = Math.max(0, Math.floor(Number(v)));
  }
  s.counters = counters;
  s.log = s.log
    .filter((e) => e && typeof e === 'object')
    .slice(0, 60)
    .map((e) => JSON.parse(JSON.stringify(e, (k, v) => (typeof v === 'string' ? v.slice(0, 80) : v))));
  const sources = {};
  for (const key of ['save', 'steam']) if (raw.sources?.[key] && typeof raw.sources[key] === 'object') sources[key] = raw.sources[key];
  s.sources = sources;
  return s;
}

export function writeProgress(state) {
  const data = serializeState({ ...state, updatedAt: new Date().toISOString() });
  queue = queue.then(async () => {
    const tmp = `${FILE}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data));
    await fs.rename(tmp, FILE);
  });
  return queue.then(() => data);
}
