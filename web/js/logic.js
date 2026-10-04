// Afhankelijkheden en status. Puur: krijgt de wiki-data en de voortgang binnen en
// rekent uit wat ontgrendeld, beschikbaar of nog vergrendeld is, en waarom.
//
// De vergrendelingen komen uit twee lagen:
//   1. regels die uit de eis-tekst van de wiki volgen ("as Bethany", "Defeat Mother",
//      "(challenge #29)", "Donate 500 Coins ...")
//   2. GATES hieronder: de paar gevallen waar de tekst niet alles zegt.

import {
  MARKS, MARK_INDEX, MARK_REQUIRES, GREEDIER, CHARACTERS, CHAR_BY_KEY,
} from '../data/characters.js';

export const LEVEL = { none: 0, normal: 1, hard: 2 };

// Uitzonderingen die niet uit de tekst te halen zijn. Elke regel met een bron.
export const GATES = {
  // The Lost: Missing Poster moet al ontgrendeld zijn (anders spawnt hij niet).
  82: { req: [{ ach: 149 }], src: 'https://bindingofisaacrebirth.wiki.gg/wiki/The_Lost' },
  // The Forgotten: Broken Shovel spawnt pas als The Lamb ooit is verslagen; de laatste
  // stap is graven in de Dark Room, dus The Negative is nodig. Boss Rush hoort erbij.
  390: {
    req: [{ ach: 78 }, { counter: 'lambKills', need: 1, label: 'The Lamb minstens 1x verslagen' }],
    src: 'https://bindingofisaacrebirth.wiki.gg/wiki/Broken_Shovel',
    how: '1) Versla de baas van Basement I binnen 1 minuut (bij Curse of the Labyrinth beide bazen). ' +
      '2) Ga terug naar de startkamer en bom de vloer: de Broken Shovel valt naar beneden. ' +
      "3) Zolang je hem draagt stampt Mom's voet op je. " +
      "4) Win Boss Rush met de schep in je actieve slot (de deur blijft dan ook na 20 minuten open); het tweede deel maakt er Mom's Shovel van. " +
      '5) Neem The Negative en graaf in de Dark Room op het aardeplekje in de grafkamer. ' +
      'Voorwaarden: The Lamb ooit verslagen, run zonder seed, niet in een Victory Lap of RERUN.',
  },
  // Bethany: Hard mode als Lazarus, zonder ook maar 1 leven te verliezen.
  404: { req: [{ char: 'lazarus' }], src: 'https://bindingofisaacrebirth.wiki.gg/wiki/Bethany' },
  // A Secret Exit: Hush 3x verslaan. Hush zelf zit achter Blue Womb.
  407: { req: [{ ach: 234 }], src: 'https://bindingofisaacrebirth.wiki.gg/wiki/Downpour' },
  // Angels / sleutelstukken: "Complete Chapter 6" = The Chest of Dark Room.
  155: { req: [{ any: [57, 78] }], src: 'https://bindingofisaacrebirth.wiki.gg/wiki/The_Chest' },
  // Eden: "Complete Chapter 4" = The Womb.
  81: { req: [{ ach: 4 }] },
  // Red Key: eerste keer Mom's Chest in Home openen.
  415: { req: [{ ach: 635 }], src: 'https://bindingofisaacrebirth.wiki.gg/wiki/Home' },
  // Mega / Mega Mush: alle gewone personages; Death Certificate: alle 34.
  276: { req: CHARACTERS.filter((c) => !c.tainted).map((c) => ({ char: c.key })) },
  547: { req: CHARACTERS.filter((c) => !c.tainted).map((c) => ({ char: c.key })) },
  636: { req: CHARACTERS.map((c) => ({ char: c.key })) },
  // Dead God: alle andere achievements (inclusief de 4 van Repentance+).
  637: { req: [{ allOthers: true }] },
};

// Unlocks die elk personage krijgt door een baas te verslaan ("Defeat Mother").
export const GENERIC = [
  { marks: ['satan'], ids: [3] },
  { marks: ['lamb'], ids: [348] },
  { marks: ['bluebaby', 'lamb'], ids: [41] },
  { marks: ['megasatan'], ids: [340] },
  { marks: ['megasatan'], ids: [270, 277, 280], also: 78 },
  { marks: ['hush'], ids: [320] },
  { marks: ['delirium'], ids: [338, 357] },
  { marks: ['mother'], ids: [405, 510, 511, 635] },
];

// Tainted-kast: tijdens je eerste Home-bezoek ligt de Red Key gegarandeerd in
// Mom's Chest en die opent dezelfde run de kast. Daarna heb je #415 nodig (of een
// trinket die tijdens de Ascent een Cracked Key wordt).
export const CLOSET_SRC = 'https://bindingofisaacrebirth.wiki.gg/wiki/Tainted_Characters';

const NAME_TO_CHAR = new Map();
for (const c of CHARACTERS) {
  NAME_TO_CHAR.set(c.wiki.toLowerCase(), c.key);
  if (c.alias) NAME_TO_CHAR.set(c.alias.toLowerCase(), c.key);
}
NAME_TO_CHAR.set('maggy', 'magdalene');
NAME_TO_CHAR.set('jacob & esau', 'jacob');

const MARK_PATTERNS = [
  [/^Defeat Mom's Heart or It Lives! on Hard mode as (.+)$/i, ['heart'], 2],
  [/^Defeat Isaac, \?\?\?, Satan, and The Lamb as (.+)$/, ['isaac', 'bluebaby', 'satan', 'lamb'], 1],
  [/^Defeat Hush and Boss Rush as (.+)$/, ['hush', 'bossrush'], 1],
  [/^Defeat Isaac as (.+)$/, ['isaac'], 1],
  [/^Defeat Satan as (.+)$/, ['satan'], 1],
  [/^Complete (?:the )?Boss Rush as (.+)$/, ['bossrush'], 1],
  [/^Defeat \?\?\? as (.+)$/, ['bluebaby'], 1],
  [/^Defeat Ultra Pride as any character, or \?\?\? as (.+)$/, ['bluebaby'], 1],
  [/^Defeat The Lamb as (.+)$/, ['lamb'], 1],
  [/^Defeat Mega Satan as (.+)$/, ['megasatan'], 1],
  [/^Defeat Ultra Greedier as (.+)$/, ['greed'], 2],
  [/^Defeat Ultra Greed as (.+)$/, ['greed'], 1],
  [/^Defeat Hush as (.+)$/, ['hush'], 1],
  [/^Defeat Delirium as (.+)$/, ['delirium'], 1],
  [/^Defeat Mother as (.+)$/, ['mother'], 1],
  [/^Defeat The Beast as (.+)$/, ['beast'], 1],
  [/^Earn all (?:12 )?(?:Hard mode )?Completion Marks(?: on Hard mode)? as (.+)$/, MARKS.map((m) => m.key), 2],
];

const COUNTER_PATTERNS = [
  [/Defeat Mom's Heart(?:\/It Lives!)? (\d+) times/, 'momKills', "Mom's Heart-kills"],
  [/Defeat Isaac (\d+) times/, 'isaacKills', 'Isaac-kills'],
  [/Defeat Satan (\d+) times/, 'satanKills', 'Satan-kills'],
  [/Defeat Hush (\d+) times/, 'hushKills', 'Hush-kills'],
  [/Defeat Baby Plum (\d+) times/, 'babyPlumKills', 'Baby Plum-kills'],
  [/Donate (\d+) [Cc]oins to the Greed Donation Machine/, 'greedDonation', 'Greed-machine'],
  [/Donate (\d+) [Cc]oins to the Donation Machine/, 'donation', 'Donation-machine'],
  [/^Die (\d+) times/, 'deaths', 'doden'],
  [/^Get a (\d+)-win streak$/, 'bestStreak', 'beste win streak'],
  [/Shell Game or Hell Game (\d+) times/, 'shellGames', 'Shell Games'],
  [/Blood Donation Machine (\d+) times/, 'bloodDonations', 'bloeddonaties'],
  [/Destroy (\d+) Tinted Rocks/, 'tintedRocks', 'tinted rocks'],
  [/Use Cards and Runes (\d+) times/, 'cardsUsed', 'kaarten/runen gebruikt'],
  [/Black Markets (\d+) times/, 'shopItems', 'aankopen'],
  [/Secret Room walls (\d+) times/, 'secretWalls', 'opgeblazen muren'],
  [/Acquire Blood Clot (\d+) times/, 'bloodClots', 'Blood Clots'],
  [/Acquire Rubber Cement (\d+) times/, 'rubberCement', 'Rubber Cements'],
  [/Lil' Batteries (\d+) times/, 'batteries', "Lil' Batteries"],
  [/Use XIII - Death (\d+) times/, 'deathCards', 'Death-kaarten'],
  [/Participate in (\d+) Daily Challenges/, 'dailiesPlayed', 'dailies gespeeld'],
  [/Complete (\d+) Daily Challenges/, 'dailiesWon', 'dailies gewonnen'],
  [/pay out with an item (\d+) times/, 'batteryBumPayouts', 'Battery Bum-uitbetalingen'],
];

// Trefwoorden in eis-teksten en wat ze vergrendelt. Alleen gebruikt als de tekst
// geen mark-patroon is (dat regelt de mark zelf al).
const KEYWORDS = [
  [/\bMother\b|\bCorpse\b|\bMausoleum\b|\bGehenna\b|\bDownpour\b|\bDross\b|\bMines\b|\bAshpit\b|Knife Piece/, [{ ach: 407 }]],
  [/\bThe Beast\b|\bDogma\b|\bHome\b|\bAscent\b/, [{ ach: 635 }]],
  [/\bHush\b|Blue Womb/, [{ ach: 234 }]],
  [/\bDelirium\b|\bThe Void\b/, [{ ach: 320 }]],
  [/\bMega Satan\b/, [{ ach: 155 }, { any: [57, 78] }]],
  [/\bGreedier\b/, [{ ach: GREEDIER }]],
  [/\bThe Lamb\b|\bDark Room\b/, [{ ach: 78 }]],
  [/Defeat \?\?\?(?! as)|\bThe Chest\b/, [{ ach: 57 }]],
  [/\bChapter 6\b/, [{ any: [57, 78] }]],
];

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9?]+/g, ' ').trim();

// Alle personages die na " as " in een tekst staan ("... as Jacob and Esau, ...").
const CHAR_NAMES = [...NAME_TO_CHAR.keys()].sort((a, b) => b.length - a.length);
function charsAfterAs(text) {
  const t = text.toLowerCase();
  const out = new Set();
  for (const name of CHAR_NAMES) {
    const needle = ` as ${name}`;
    for (let i = t.indexOf(needle); i >= 0; i = t.indexOf(needle, i + 1)) {
      const next = t[i + needle.length];
      if (next === undefined || /[\s,.)]/.test(next)) out.add(NAME_TO_CHAR.get(name));
    }
  }
  return out;
}

export function charUnlocked(state, key) {
  const c = CHAR_BY_KEY[key];
  return !c.unlock || state.achievements.has(c.unlock);
}

export function markLevel(state, charKey, markKey) {
  const m = state.marks[charKey];
  return m ? m[MARK_INDEX[markKey]] || 0 : 0;
}

// Bouwt alle afgeleide tabellen eenmalig op uit de wiki-data.
export function buildModel(achievements) {
  const byId = new Map(achievements.map((a) => [a.id, a]));
  const byName = new Map();
  for (const a of achievements) if (!byName.has(norm(a.name))) byName.set(norm(a.name), a.id);

  // Challenge-nummer -> achievement dat de challenge beschikbaar maakt.
  const challengeNames = {};
  for (const a of achievements) {
    for (const m of a.how.matchAll(/Complete (.+?) \(challenge #(\d+)\)/gi)) challengeNames[m[2]] = m[1];
  }
  const challengeUnlock = {};
  for (const [n, name] of Object.entries(challengeNames)) {
    const hit = achievements.find(
      (a) => a.unlock === `Unlocked Challenge #${n}.` ||
        (a.unlock === 'Unlocked a new challenge.' && norm(a.name) === norm(name)),
    );
    if (hit) challengeUnlock[n] = hit.id;
  }

  // Mark -> beloning. rewards[char][markKey] = { 1: [ids], 2: [ids] }
  const rewards = Object.fromEntries(CHARACTERS.map((c) => [c.key, {}]));
  const markOf = new Map(); // achievement-id -> { char, marks, level }
  for (const a of achievements) {
    for (const [re, marks, level] of MARK_PATTERNS) {
      const m = a.how.match(re);
      if (!m) continue;
      const char = NAME_TO_CHAR.get(m[1].toLowerCase());
      if (!char) break;
      markOf.set(a.id, { char, marks, level });
      const slot = marks.length === 1 ? marks[0] : marks.length === 12 ? 'all' : marks.join('+');
      const r = (rewards[char][slot] ||= { marks, 1: [], 2: [] });
      r[level].push(a.id);
      break;
    }
  }

  const closetOf = new Map();
  for (const c of CHARACTERS) if (c.tainted) closetOf.set(c.unlock, c.base);
  const charOfUnlock = new Map(CHARACTERS.filter((c) => c.unlock).map((c) => [c.unlock, c.key]));

  // Eisen per achievement.
  const reqs = new Map();
  const counterRule = new Map();
  for (const a of achievements) {
    const list = [];
    const add = (r) => {
      const k = JSON.stringify(r);
      if (!list.some((x) => JSON.stringify(x) === k)) list.push(r);
    };
    const mark = markOf.get(a.id);
    if (mark) {
      add({ char: mark.char });
      for (const mk of mark.marks) for (const r of MARK_REQUIRES[mk]) add(Array.isArray(r) ? { any: r } : { ach: r });
      if (mark.marks.includes('greed') && mark.level === 2) add({ ach: GREEDIER });
    } else if (closetOf.has(a.id)) {
      add({ char: closetOf.get(a.id) });
      add({ ach: 635 });
    } else {
      for (const ch of charsAfterAs(a.how)) add({ char: ch });
      for (const [re, rs] of KEYWORDS) if (re.test(a.how)) rs.forEach(add);
      for (const m of a.how.matchAll(/challenge #(\d+)/gi)) {
        const u = challengeUnlock[m[1]];
        if (u && u !== a.id) add({ ach: u });
      }
      // "unlock Lazarus", "Unlock Bethany, Blood Bag, and It Lives!"
      const ul = a.how.match(/\bunlock(?:ing)? (.+?)(?:$|\.)/i);
      if (ul) {
        for (const part of ul[1].split(/,\s*(?:and\s+)?|\s+and\s+/)) {
          const p = norm(part);
          const ch = NAME_TO_CHAR.get(part.trim().toLowerCase());
          if (ch) add({ char: ch });
          else if (byName.has(p) && byName.get(p) !== a.id) add({ ach: byName.get(p) });
        }
      }
    }
    const gate = GATES[a.id];
    if (gate) gate.req.forEach(add);
    // Een eis op zichzelf (bijv. "Defeat Mother" bij Mother-unlocks) weghalen.
    reqs.set(a.id, list.filter((r) => r.ach !== a.id));

    for (const [re, counter, label] of COUNTER_PATTERNS) {
      const m = a.how.match(re);
      if (m) {
        counterRule.set(a.id, { counter, need: Number(m[1]), label });
        break;
      }
    }
  }

  return { achievements, byId, byName, rewards, markOf, closetOf, charOfUnlock, reqs, counterRule, challengeUnlock };
}

// Lege of onvolledige voortgang normaliseren tot het interne formaat.
export function normalizeState(raw = {}) {
  const marks = {};
  for (const c of CHARACTERS) {
    const m = raw.marks?.[c.key];
    marks[c.key] = MARKS.map((_, i) => Math.max(0, Math.min(2, Number(m?.[i]) || 0)));
  }
  return {
    achievements: new Set((raw.achievements || []).map(Number).filter((n) => n > 0)),
    marks,
    counters: { ...(raw.counters || {}) },
    manual: new Set((raw.manual || []).map(Number)),
    sources: { ...(raw.sources || {}) },
    log: Array.isArray(raw.log) ? raw.log.slice(0, 60) : [],
    updatedAt: raw.updatedAt || null,
  };
}

export function serializeState(s) {
  return {
    version: 1,
    achievements: [...s.achievements].sort((a, b) => a - b),
    marks: s.marks,
    counters: s.counters,
    manual: [...s.manual].sort((a, b) => a - b),
    sources: s.sources,
    log: s.log.slice(0, 60),
    updatedAt: s.updatedAt,
  };
}

function meets(model, state, r) {
  if (r.ach) return state.achievements.has(r.ach);
  if (r.any) return r.any.some((id) => state.achievements.has(id));
  if (r.char) return charUnlocked(state, r.char);
  if (r.allOthers) {
    const others = state.achievements.size - (state.achievements.has(637) ? 1 : 0);
    return others >= model.achievements.length - 1;
  }
  if (r.counter) {
    const have = state.counters[r.counter];
    return have === undefined ? null : have >= r.need;
  }
  return true;
}

// Uitleg hoe je iets haalt: een eigen tekst waar de wiki-regel te kort is.
export function howOf(model, id) {
  return GATES[id]?.how || model.byId.get(id)?.how || '';
}

export function describeReq(model, r) {
  if (r.ach) return model.byId.get(r.ach)?.name || `#${r.ach}`;
  if (r.any) return r.any.map((id) => model.byId.get(id)?.name).join(' of ');
  if (r.char) return `${CHAR_BY_KEY[r.char].name} ontgrendeld`;
  if (r.counter) return r.label;
  if (r.allOthers) return 'alle andere achievements';
  return '?';
}

// Status van één achievement: done | open | locked (+ wat ontbreekt).
export function achStatus(model, state, id) {
  const done = state.achievements.has(id);
  const missing = [];
  for (const r of model.reqs.get(id) || []) {
    const ok = meets(model, state, r);
    if (ok === false) missing.push(r);
  }
  const rule = model.counterRule.get(id);
  const progress = rule
    ? { ...rule, have: state.counters[rule.counter] ?? null }
    : null;
  return { id, status: done ? 'done' : missing.length ? 'locked' : 'open', missing, progress };
}

// Keten van blokkades voor een vergrendeld achievement, diepte-eerst, zonder lussen.
export function blockerChain(model, state, id, depth = 0, seen = new Set()) {
  const st = achStatus(model, state, id);
  if (seen.has(id) || depth > 6) return [];
  seen.add(id);
  return st.missing.map((r) => {
    const node = { req: r, label: describeReq(model, r) };
    const next = r.ach || (r.char && CHAR_BY_KEY[r.char].unlock) || (r.any && r.any[0]);
    if (next && !state.achievements.has(next)) {
      node.id = next;
      node.children = blockerChain(model, state, next, depth + 1, seen);
    }
    return node;
  });
}

// Kan dit personage deze mark nu halen? Geeft ontbrekende eisen terug.
export function markAccess(model, state, charKey, markKey, level = 1) {
  const missing = [];
  if (!charUnlocked(state, charKey)) missing.push({ char: charKey });
  for (const r of MARK_REQUIRES[markKey]) {
    const req = Array.isArray(r) ? { any: r } : { ach: r };
    if (!meets(model, state, req)) missing.push(req);
  }
  if (markKey === 'greed' && level === 2 && !state.achievements.has(GREEDIER)) missing.push({ ach: GREEDIER });
  return missing;
}

// Welke achievements volgen er uit de huidige marks? (voor afvinken met de hand)
export function impliedAchievements(model, state) {
  const out = new Set();
  for (const c of CHARACTERS) {
    const marks = state.marks[c.key];
    for (const r of Object.values(model.rewards[c.key])) {
      for (const level of [1, 2]) {
        if (r[level].length && r.marks.every((mk) => marks[MARK_INDEX[mk]] >= level)) {
          r[level].forEach((id) => out.add(id));
        }
      }
    }
  }
  // Algemene unlocks voor een baas, ongeacht het personage.
  for (const g of GENERIC) {
    const beaten = g.marks.every((mk) => CHARACTERS.some((c) => state.marks[c.key][MARK_INDEX[mk]] >= 1));
    if (beaten && (!g.also || state.achievements.has(g.also))) g.ids.forEach((id) => out.add(id));
  }
  const regular = CHARACTERS.filter((c) => !c.tainted);
  const allHard = (list) => list.every((c) => state.marks[c.key].every((v) => v >= 2));
  if (regular.every((c) => state.marks[c.key][MARK_INDEX.megasatan] >= 1)) out.add(276);
  if (allHard(regular)) out.add(547);
  if (allHard(CHARACTERS)) out.add(636);
  return out;
}

// Mark zetten en de bijbehorende achievements meenemen. Geeft terug wat er bij
// kwam en wat er weg ging, zodat de UI het kan tonen.
export function setMark(model, state, charKey, markKey, level, source = 'hand') {
  const before = impliedAchievements(model, state);
  const prev = state.marks[charKey][MARK_INDEX[markKey]];
  state.marks[charKey][MARK_INDEX[markKey]] = level;
  const after = impliedAchievements(model, state);
  const added = [];
  const removed = [];
  for (const id of after) {
    if (!state.achievements.has(id)) {
      state.achievements.add(id);
      added.push(id);
    }
  }
  for (const id of before) {
    if (!after.has(id) && state.achievements.has(id) && state.manual.has(id)) {
      state.achievements.delete(id);
      removed.push(id);
    }
  }
  added.forEach((id) => state.manual.add(id));
  removed.forEach((id) => state.manual.delete(id));
  if (prev !== level) {
    state.log.unshift({ t: Date.now(), kind: 'mark', char: charKey, mark: markKey, level, source, added });
  }
  return { added, removed };
}

export function setAchievement(model, state, id, on, source = 'hand') {
  if (on === state.achievements.has(id)) return false;
  if (on) state.achievements.add(id);
  else state.achievements.delete(id);
  if (on) state.manual.add(id);
  else state.manual.delete(id);
  state.log.unshift({ t: Date.now(), kind: 'ach', id, on, source });
  return true;
}

// Samenvatting voor het overzicht.
export function totals(model, state) {
  const chars = CHARACTERS.filter((c) => charUnlocked(state, c.key)).length;
  let marks = 0;
  let hard = 0;
  for (const c of CHARACTERS) {
    for (const v of state.marks[c.key]) {
      if (v >= 1) marks++;
      if (v >= 2) hard++;
    }
  }
  return {
    achievements: state.achievements.size,
    achievementsTotal: model.achievements.length,
    chars,
    charsTotal: CHARACTERS.length,
    marks,
    hard,
    marksTotal: CHARACTERS.length * MARKS.length,
  };
}

// Save-import samenvoegen. De save is leidend; handmatige vinkjes die er niet in
// staan blijven alleen als keepManual waar is.
export function diffSave(model, state, save) {
  const saveAch = new Set(save.achievements);
  const gained = [...saveAch].filter((id) => !state.achievements.has(id));
  const lost = [...state.achievements].filter((id) => !saveAch.has(id));
  const marks = [];
  CHARACTERS.forEach((c, ci) => {
    MARKS.forEach((m, mi) => {
      const now = state.marks[c.key][mi];
      const next = Math.max(save.marks[ci][mi], save.online?.[ci]?.[mi] || 0);
      if (now !== next) marks.push({ char: c.key, mark: m.key, from: now, to: next });
    });
  });
  return { gained, lost, lostManual: lost.filter((id) => state.manual.has(id)), marks };
}

export function applySave(model, state, save, { keepManual = [] } = {}) {
  const keep = new Set(keepManual);
  const next = new Set(save.achievements);
  for (const id of keep) next.add(id);
  const gained = [...next].filter((id) => !state.achievements.has(id));
  state.achievements = next;
  state.manual = new Set([...state.manual].filter((id) => keep.has(id)));
  CHARACTERS.forEach((c, ci) => {
    state.marks[c.key] = MARKS.map((_, mi) => Math.max(save.marks[ci][mi], save.online?.[ci]?.[mi] || 0));
  });
  state.counters = { ...save.counters };
  state.sources.save = { at: Date.now(), edition: save.edition, achievements: save.achievements.length };
  state.log.unshift({ t: Date.now(), kind: 'save', gained, source: 'save' });
  return gained;
}

// Steam vult alleen aan: nooit iets terugzetten, en een mark hooguit op normal.
export function applySteam(model, state, ids) {
  const gained = [];
  for (const id of ids) {
    if (!state.achievements.has(id) && model.byId.has(id)) {
      state.achievements.add(id);
      gained.push(id);
    }
  }
  for (const id of ids) {
    const mk = model.markOf.get(id);
    if (!mk || mk.level !== 1) continue;
    for (const key of mk.marks) {
      const i = MARK_INDEX[key];
      if (state.marks[mk.char][i] < 1) state.marks[mk.char][i] = 1;
    }
  }
  state.sources.steam = { at: Date.now(), count: ids.length };
  state.log.unshift({ t: Date.now(), kind: 'steam', gained, source: 'steam' });
  return gained;
}
