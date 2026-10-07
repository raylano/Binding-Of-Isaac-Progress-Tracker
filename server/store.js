// Voortgang per account: data/users/<account-id>/progress.json. Het pad komt
// alleen uit een door de server gemaakt account-ID (32 hex-tekens), nooit uit
// invoer van de gebruiker. Lezen-aanpassen-schrijven loopt per account via een
// slot, zodat twee gelijktijdige verzoeken elkaars wijziging niet wegvegen.
//
// Het oude data/progress.json (van vóór de accounts) wordt nooit aan een account
// getoond. De eigenaar kan het één keer overnemen door de oude ACCESS_PIN te
// bewijzen; data/legacy-claim.json legt vast wie dat deed.

import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { USER_ID } from './accounts.js';
import { readJson, writeJson, withLock } from './jsonfile.js';
import { normalizeState, serializeState } from '../web/js/logic.js';

const LEGACY = path.join(config.dataDir, 'progress.json');
const CLAIM = path.join(config.dataDir, 'legacy-claim.json');

function progressFile(userId) {
  if (!USER_ID.test(userId)) throw new Error('Ongeldig account-ID');
  return path.join(config.dataDir, 'users', userId, 'progress.json');
}

export const readProgress = (userId) => readJson(progressFile(userId));

function stamp(state) {
  return serializeState({ ...state, updatedAt: new Date().toISOString() });
}

// fn krijgt de huidige stand (of null) en geeft de nieuwe state terug, of
// undefined om niets te schrijven. Geeft { saved, result } terug.
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
  // Alleen de velden die applySave/applySteam zetten, als getal of korte tekst:
  // de Sync-pagina toont ze.
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

// ---------- Oude voortgang ----------

export function legacyAvailable() {
  return Boolean(config.pin) && fss.existsSync(LEGACY) && !fss.existsSync(CLAIM);
}

export class ClaimError extends Error {}

function isEmpty(progress) {
  if (!progress) return true;
  const s = normalizeState(progress);
  return !s.achievements.size && !Object.values(s.marks).some((m) => m.some(Boolean));
}

// De PIN is al gecontroleerd. Het claimbestand wordt exclusief aangemaakt
// ('wx'): van gelijktijdige pogingen kan er maar één slagen. Mislukt het
// kopiëren daarna, dan gaat de claim terug zodat de eigenaar het opnieuw kan doen.
export function claimLegacy(userId, maxId) {
  return withLock(`progress:${userId}`, async () => {
    if (!legacyAvailable()) throw new ClaimError('Er is geen oude voortgang (meer) om over te nemen.');
    const file = progressFile(userId);
    if (!isEmpty(await readJson(file))) {
      throw new ClaimError('Dit account heeft al eigen voortgang. Neem de oude voortgang over met een nieuw, leeg account.');
    }
    const legacy = await readJson(LEGACY);
    if (!legacy) throw new ClaimError('Er is geen oude voortgang (meer) om over te nemen.');
    let handle;
    try {
      handle = await fs.open(CLAIM, 'wx', 0o600);
    } catch (err) {
      if (err.code === 'EEXIST') throw new ClaimError('De oude voortgang is al overgenomen.');
      throw err;
    }
    try {
      await handle.writeFile(JSON.stringify({ userId, at: new Date().toISOString() }));
      await handle.close();
      handle = null;
      const saved = stamp(sanitize(legacy, maxId));
      await writeJson(file, saved);
      return saved;
    } catch (err) {
      await handle?.close().catch(() => {});
      await fs.rm(CLAIM, { force: true });
      throw err;
    }
  });
}
