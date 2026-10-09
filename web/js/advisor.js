// Route advice: which run pays off most right now, and where you are in the meta route.
// Pure, just like logic.js.

import { CHARACTERS, CHAR_BY_KEY, MARK_INDEX } from '../data/characters.js';
import { ROUTE, AVOID, PHASES } from '../data/route.js';
import { achStatus, markAccess, impliedAchievements, charUnlocked, blockerChain } from './logic.js';

// A run combines marks that can be earned in one go. In Repentance+ the Void
// portal is guaranteed after Hush, ???, The Lamb and Mega Satan, so Delirium can
// be added to the end of any Womb run.
export const RUNS = [
  {
    key: 'cathedral',
    name: 'Cathedral run',
    marks: ['heart', 'bossrush', 'hush', 'isaac', 'bluebaby', 'delirium'],
    path: [
      'Mom within 20 min → Boss Rush',
      "Mom's Heart within 30 min → Blue Womb → Hush",
      'Cathedral → Isaac',
      'The Polaroid to The Chest → ???',
      'Void portal → Delirium',
    ],
  },
  {
    key: 'sheol',
    name: 'Sheol run',
    marks: ['heart', 'bossrush', 'hush', 'satan', 'lamb', 'delirium'],
    path: [
      'Mom within 20 min → Boss Rush',
      "Mom's Heart within 30 min → Blue Womb → Hush",
      'Sheol → Satan',
      'The Negative to the Dark Room → The Lamb',
      'Void portal → Delirium',
    ],
  },
  {
    key: 'megasatan',
    name: 'Mega Satan run',
    marks: ['heart', 'bossrush', 'hush', 'isaac|satan', 'megasatan', 'delirium'],
    path: [
      'Bomb angel statues and grab both key pieces (or Dad\'s Key)',
      'Mom within 20 min → Boss Rush; Mom\'s Heart within 30 min → Hush',
      'Cathedral or Sheol → Chest or Dark Room',
      'Golden door in the starting room → Mega Satan',
      'Void portal → Delirium',
    ],
  },
  {
    key: 'mother',
    name: 'Alt path run',
    marks: ['mother', 'bossrush'],
    path: [
      'Downpour/Dross II: touch the white fire → enter the mirror → knife piece 1',
      'Mines/Ashpit II: 3 yellow buttons → minecart → knife piece 2',
      'Mausoleum/Gehenna II: Mom within 25 min (counts for Boss Rush)',
      "Flesh door with the knife → Mom's Heart → Corpse",
      'Corpse II → Mother',
    ],
  },
  {
    key: 'home',
    name: 'Home run',
    marks: ['beast'],
    closet: true,
    path: [
      'From your 2nd Home visit on: before Dad\'s Note, drop a trinket in a Boss or Treasure Room (it becomes a Cracked Key)',
      'Mom in Depths II → take The Polaroid or The Negative',
      'Back to the Strange Door in the starting room (Polaroid/Negative is used up)',
      "Mausoleum II: no Mom fight, the boss room holds Dad's Note → Ascent",
      'Home: open the closet in the hallway with the (Cracked) Red Key → tainted character',
      'Dogma → The Beast',
    ],
  },
  {
    key: 'greed',
    name: 'Greed run',
    marks: ['greed'],
    greed: true,
    path: [
      'Greed mode (or Greedier if unlocked: counts as the hard mark)',
      'Donate leftover coins to the Greed machine after Ultra Greed',
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

// What does it yield if these marks are earned (at this level)?
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
  // Marks that only yield a "postpone" unlock are deliberately left alone
  // (e.g. Boss Rush as Lazarus = Missing No.).
  const skipped = [];
  for (const mk of [...marks]) {
    const own = gainsFor(model, state, charKey, [mk], 1);
    if (own.length && own.every((id) => AVOID[id]?.level === 'hard')) {
      marks.splice(marks.indexOf(mk), 1);
      skipped.push({ mark: mk, ids: own });
    }
  }
  // The run's core boss must be reachable, otherwise it is not a real option.
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

  // Hard pays off extra when Hard-only rewards (MH baby, all Hard marks) are still open.
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

// Best runs across all characters. Chosen greedily: an unlock that an earlier run
// already yields (e.g. A Strange Door) does not count again for the next one.
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

// Counters that are close to yielding an unlock ("1 more coin").
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

// Difference between your progress and the meta: what you already have "too early"
// and which postpone unlocks are now within reach.
export function metaNotes(model, state) {
  const notes = [];
  for (const [id, a] of Object.entries(AVOID)) {
    const st = achStatus(model, state, Number(id));
    if (st.status === 'done') notes.push({ kind: 'al-binnen', id: Number(id), ...a });
    else if (st.status === 'open' && a.level === 'hard') notes.push({ kind: 'pas-op', id: Number(id), ...a });
  }
  if (charUnlocked(state, 'lost') && !state.achievements.has(250)) {
    notes.push({ kind: 'tip', text: 'You have The Lost, but not Holy Mantle yet (879 coins in the Greed machine): the guides recommend playing his marks only after that.', src: ['PIEL', 'JNUB'] });
  }
  return notes;
}

export { blockerChain };
