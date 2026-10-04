// Route-advies: welke run levert nu het meeste op, en waar sta je in de meta-route.
// Puur, net als logic.js.

import { CHARACTERS, CHAR_BY_KEY, MARK_INDEX } from '../data/characters.js';
import { ROUTE, AVOID, PHASES } from '../data/route.js';
import { achStatus, markAccess, impliedAchievements, charUnlocked, blockerChain } from './logic.js';

// Een run combineert marks die in één keer haalbaar zijn. In Repentance+ is het
// Void-portaal gegarandeerd na Hush, ???, The Lamb en Mega Satan, dus Delirium kan
// achter elke Womb-run aan.
export const RUNS = [
  {
    key: 'cathedral',
    name: 'Kathedraal-run',
    marks: ['heart', 'bossrush', 'hush', 'isaac', 'bluebaby', 'delirium'],
    path: [
      'Mom binnen 20 min → Boss Rush',
      "Mom's Heart binnen 30 min → Blue Womb → Hush",
      'Cathedral → Isaac',
      'Met The Polaroid naar The Chest → ???',
      'Void-portaal → Delirium',
    ],
  },
  {
    key: 'sheol',
    name: 'Sheol-run',
    marks: ['heart', 'bossrush', 'hush', 'satan', 'lamb', 'delirium'],
    path: [
      'Mom binnen 20 min → Boss Rush',
      "Mom's Heart binnen 30 min → Blue Womb → Hush",
      'Sheol → Satan',
      'Met The Negative naar de Dark Room → The Lamb',
      'Void-portaal → Delirium',
    ],
  },
  {
    key: 'megasatan',
    name: 'Mega Satan-run',
    marks: ['heart', 'bossrush', 'hush', 'isaac|satan', 'megasatan', 'delirium'],
    path: [
      'Bom engelenbeelden en pak beide sleutelstukken (of Dad\'s Key)',
      'Mom binnen 20 min → Boss Rush; Mom\'s Heart binnen 30 min → Hush',
      'Cathedral of Sheol → Chest of Dark Room',
      'Gouden deur in de startkamer → Mega Satan',
      'Void-portaal → Delirium',
    ],
  },
  {
    key: 'mother',
    name: 'Alt-path-run',
    marks: ['mother', 'bossrush'],
    path: [
      'Downpour/Dross II: witte vlam aanraken → spiegel in → mesdeel 1',
      'Mines/Ashpit II: 3 gele knoppen → mijnkar → mesdeel 2',
      'Mausoleum/Gehenna II: Mom binnen 25 min (telt voor Boss Rush)',
      "Vleesdeur met het mes → Mom's Heart → Corpse",
      'Corpse II → Mother',
    ],
  },
  {
    key: 'home',
    name: 'Home-run',
    marks: ['beast'],
    closet: true,
    path: [
      'Vanaf je 2e Home-bezoek: leg vóór Dad\'s Note een trinket in een Boss- of Treasure Room (wordt een Cracked Key)',
      'Mom in Depths II → pak The Polaroid of The Negative',
      'Terug naar de Strange Door in de startkamer (Polaroid/Negative wordt opgebruikt)',
      "Mausoleum II: geen Mom-gevecht, de bossroom bevat Dad's Note → Ascent",
      'Home: kast in de gang openen met de (Cracked) Red Key → tainted personage',
      'Dogma → The Beast',
    ],
  },
  {
    key: 'greed',
    name: 'Greed-run',
    marks: ['greed'],
    greed: true,
    path: [
      'Greed mode (of Greedier als dat open is: telt als de harde mark)',
      'Doneer overgebleven munten aan de Greed-machine na Ultra Greed',
    ],
  },
];

const ROUTE_IDS = new Set(ROUTE.flatMap((s) => s.ach));
const GATE_BONUS = { 635: 8, 407: 4, 320: 4, 415: 3, 405: 2, 340: 2, 341: 2, 234: 3 };

export function valueOf(model, id) {
  const avoid = AVOID[id];
  if (avoid) return avoid.level === 'hard' ? -3 : -0.5;
  let v = 1;
  if (ROUTE_IDS.has(id)) v += 2;
  if (model.charOfUnlock.has(id)) v += 4;
  v += GATE_BONUS[id] || 0;
  return v;
}

function cloneMarks(state) {
  return { ...state, marks: Object.fromEntries(Object.entries(state.marks).map(([k, v]) => [k, [...v]])) };
}

// Wat levert het op als deze marks (op dit niveau) gehaald worden?
function gainsFor(model, state, charKey, markKeys, level) {
  const sim = cloneMarks(state);
  for (const mk of markKeys) {
    const i = MARK_INDEX[mk];
    if (sim.marks[charKey][i] < level) sim.marks[charKey][i] = level;
  }
  const after = impliedAchievements(model, sim);
  return [...after].filter((id) => !state.achievements.has(id));
}

export function planRun(model, state, charKey, run) {
  const char = CHAR_BY_KEY[charKey];
  const marks = [];
  const blocked = [];
  for (const spec of run.marks) {
    let mk = spec;
    if (spec.includes('|')) {
      const opts = spec.split('|');
      mk = opts.find((o) => state.marks[charKey][MARK_INDEX[o]] < 1) || opts[0];
    }
    if (state.marks[charKey][MARK_INDEX[mk]] >= 1) continue;
    const missing = markAccess(model, state, charKey, mk);
    if (missing.length) blocked.push({ mark: mk, missing });
    else marks.push(mk);
  }
  // Marks die alleen een "uitstellen"-unlock opleveren laten we bewust liggen
  // (bijv. Boss Rush als Lazarus = Missing No.).
  const skipped = [];
  for (const mk of [...marks]) {
    const own = gainsFor(model, state, charKey, [mk], 1);
    if (own.length && own.every((id) => AVOID[id]?.level === 'hard')) {
      marks.splice(marks.indexOf(mk), 1);
      skipped.push({ mark: mk, ids: own });
    }
  }
  // De kernbaas van de run moet haalbaar zijn, anders is het geen echte optie.
  const core = run.key === 'cathedral' ? ['bluebaby', 'isaac'] : run.key === 'sheol' ? ['lamb', 'satan']
    : run.key === 'megasatan' ? ['megasatan'] : run.key === 'mother' ? ['mother']
      : run.key === 'home' ? ['beast'] : ['greed'];
  const closet = run.closet && !char.tainted && !charUnlocked(state, `t-${charKey}`)
    && state.achievements.has(635) && charUnlocked(state, charKey);
  const greedier = run.greed && state.achievements.has(341)
    && state.marks[charKey][MARK_INDEX.greed] < 2 && charUnlocked(state, charKey);
  if (!core.some((c) => marks.includes(c)) && !closet && !greedier) return null;

  const gains = gainsFor(model, state, charKey, marks, 1);
  if (greedier) for (const id of gainsFor(model, state, charKey, ['greed'], 2)) if (!gains.includes(id)) gains.push(id);
  if (closet) gains.push(char.index + 474);

  // Op Hard levert extra op als er Hard-only beloningen (MH-baby, alle Hard-marks) open staan.
  const hardOnly = gainsFor(model, state, charKey, marks, 2).filter((id) => !gains.includes(id));

  const score = gains.reduce((s, id) => s + valueOf(model, id), 0) + marks.length * 0.35;
  const warnings = gains.filter((id) => AVOID[id]).map((id) => ({ id, ...AVOID[id] }));
  return { char: charKey, run: run.key, name: run.name, path: run.path, marks, blocked, skipped, gains, hardOnly, score, warnings, closet };
}

export function plansFor(model, state, charKey) {
  if (!charUnlocked(state, charKey)) return [];
  return RUNS.map((run) => planRun(model, state, charKey, run))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
}

// Beste runs over alle personages heen. Gretig gekozen: een unlock die een eerdere
// run al oplevert (bijv. A Strange Door) telt bij de volgende niet nog eens mee.
export function bestRuns(model, state, limit = 6) {
  const candidates = CHARACTERS.flatMap((c) => plansFor(model, state, c.key));
  const claimed = new Set();
  const usedChars = new Set();
  const picks = [];
  const rescore = (p) => {
    const fresh = p.gains.filter((id) => !claimed.has(id));
    return { fresh, score: fresh.reduce((s, id) => s + valueOf(model, id), 0) + p.marks.length * 0.35 };
  };
  while (picks.length < limit) {
    let best = null;
    for (const p of candidates) {
      if (usedChars.has(p.char)) continue;
      const r = rescore(p);
      if (!best || r.score > best.score) best = { ...p, ...r };
    }
    if (!best || best.score <= 0.5) break;
    picks.push(best);
    usedChars.add(best.char);
    best.fresh.forEach((id) => claimed.add(id));
  }
  return picks;
}

export function routeProgress(model, state) {
  let current = null;
  const steps = ROUTE.map((step) => {
    const items = step.ach.map((id) => achStatus(model, state, id));
    const done = items.every((s) => s.status === 'done');
    const open = !done && items.some((s) => s.status === 'open');
    const status = done ? 'done' : open ? 'open' : 'locked';
    const out = { ...step, items, status };
    if (!done && !current) current = step.key;
    return out;
  });
  const doneCount = steps.filter((s) => s.status === 'done').length;
  return { steps, current, doneCount, total: steps.length, phases: PHASES };
}

// Tellers die bijna een unlock opleveren ("nog 1 munt").
export function quickWins(model, state, limit = 5) {
  const out = [];
  for (const [id, rule] of model.counterRule) {
    if (state.achievements.has(id)) continue;
    const have = state.counters[rule.counter];
    if (have === undefined) continue;
    const st = achStatus(model, state, id);
    if (st.status !== 'open') continue;
    const left = rule.need - have;
    if (left <= 0) continue;
    const ratio = have / rule.need;
    if (ratio >= 0.6 || left <= 10) out.push({ id, ...rule, have, left, ratio, avoid: AVOID[id] || null });
  }
  return out.sort((a, b) => (a.avoid ? 1 : 0) - (b.avoid ? 1 : 0) || b.ratio - a.ratio).slice(0, limit);
}

// Verschil tussen jouw stand en de meta: wat je al "te vroeg" hebt en welke
// uitstel-unlocks nu binnen handbereik liggen.
export function metaNotes(model, state) {
  const notes = [];
  for (const [id, a] of Object.entries(AVOID)) {
    const st = achStatus(model, state, Number(id));
    if (st.status === 'done') notes.push({ kind: 'al-binnen', id: Number(id), ...a });
    else if (st.status === 'open' && a.level === 'hard') notes.push({ kind: 'pas-op', id: Number(id), ...a });
  }
  if (charUnlocked(state, 'lost') && !state.achievements.has(250)) {
    notes.push({ kind: 'tip', text: 'Je hebt The Lost, maar Holy Mantle (879 munten in de Greed-machine) nog niet: de guides raden aan zijn marks pas daarna te spelen.', src: ['PIEL', 'JNUB'] });
  }
  return notes;
}

export { blockerChain };
