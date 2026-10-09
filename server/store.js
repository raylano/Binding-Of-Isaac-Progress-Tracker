// Progress per account: data/users/<account-id>/progress.json. The path only ever
// comes from a server-generated account ID (32 hex characters), never from user
// input. Read-modify-write runs through a per-account lock, so two concurrent
// requests cannot wipe out each other's change.

import path from 'node:path';
import { config } from './config.js';
import { USER_ID } from './accounts.js';
import { readJson, writeJson, withLock } from './jsonfile.js';
import { normalizeState, serializeState } from '../web/js/logic.js';

function progressFile(userId) {
  if (!USER_ID.test(userId)) throw new Error('Invalid account ID');
  return path.join(config.dataDir, 'users', userId, 'progress.json');
}

export const readProgress = (userId) => readJson(progressFile(userId));

function stamp(state) {
  return serializeState({ ...state, updatedAt: new Date().toISOString() });
}

// fn receives the current state (or null) and returns the new state, or
// undefined to write nothing. Returns { saved }.
export function updateProgress(userId, fn) {
  const file = progressFile(userId);
  return withLock(`progress:${userId}`, async () => {
    const current = await readJson(file);
    const next = await fn(current);
    if (next === undefined) return { saved: current };
    const saved = stamp(next);
    await writeJson(file, saved);
    return { saved };
  });
}

// Everything that comes in goes through normalizeState: unknown fields are
// dropped and numbers are clamped, so a client cannot put junk in the file.
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
  // Only the fields applySave/applySteam set, as a number or short text: the
  // Sync page shows them.
  const num = (v) => Math.max(0, Math.floor(Number(v) || 0));
  const at = (v) => { const t = typeof v === 'number' || typeof v === 'string' ? new Date(v).getTime() : NaN; return Number.isFinite(t) ? t : null; };
  const save = raw.sources?.save;
  const steam = raw.sources?.steam;
  s.sources = {};
  if (save && typeof save === 'object') {
    s.sources.save = { at: at(save.at), edition: String(save.edition ?? '').replace(/[^\w .+-]/g, '').slice(0, 40), achievements: num(save.achievements) };
  }
  if (steam && typeof steam === 'object') s.sources.steam = { at: at(steam.at), count: num(steam.count) };
  return s;
}
