import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildModel, normalizeState, achStatus, markAccess, setMark, impliedAchievements, applySteam } from '../web/js/logic.js';
import { plansFor, bestRuns, quickWins } from '../web/js/advisor.js';
import { CHARACTERS, MARK_INDEX } from '../web/data/characters.js';
import { ROUTE, AVOID } from '../web/data/route.js';

const data = JSON.parse(fs.readFileSync(new URL('../web/data/achievements.json', import.meta.url)));
const model = buildModel(data);
const state = (ach = [], extra = {}) => normalizeState({ achievements: ach, ...extra });

test('wiki-data: 641 achievements, ID 1..641 zonder gaten', () => {
  assert.equal(data.length, 641);
  data.forEach((a, i) => assert.equal(a.id, i + 1));
});

test('elke personage-unlock en elk route-ID bestaat', () => {
  for (const c of CHARACTERS) if (c.unlock) assert.ok(model.byId.has(c.unlock), c.key);
  for (const s of ROUTE) for (const id of s.ach) assert.ok(model.byId.has(id), `${s.key}:${id}`);
  for (const id of Object.keys(AVOID)) assert.ok(model.byId.has(Number(id)), id);
});

test('mark-beloningen: gewone personages 12 marks + alles-op-Hard, tainted 7 groepen', () => {
  for (const c of CHARACTERS) {
    const slots = Object.keys(model.rewards[c.key]);
    assert.equal(slots.length, c.tainted ? 7 : 13, `${c.key}: ${slots}`);
  }
});

test('Mother: op slot zonder A Secret Exit (#407), bereikbaar met', () => {
  const s = state([1, 4, 79]);
  assert.ok(markAccess(model, s, 'isaac', 'mother').some((r) => r.ach === 407));
  assert.equal(markAccess(model, state([4, 407]), 'isaac', 'mother').length, 0);
  assert.equal(achStatus(model, state([4]), 635).status, 'locked');
  assert.equal(achStatus(model, state([4, 234, 407]), 635).status, 'open');
});

test('Downpour-pad: A Secret Exit vereist Blue Womb en telt Hush-kills', () => {
  const st = achStatus(model, state([4], { counters: { hushKills: 2 } }), 407);
  assert.equal(st.status, 'locked');
  const open = achStatus(model, state([4, 234], { counters: { hushKills: 2 } }), 407);
  assert.equal(open.status, 'open');
  assert.deepEqual([open.progress.have, open.progress.need], [2, 3]);
});

test('The Beast: op slot zonder A Strange Door (#635)', () => {
  assert.ok(markAccess(model, state([4, 407]), 'isaac', 'beast').some((r) => r.ach === 635));
  assert.equal(markAccess(model, state([4, 407, 635]), 'isaac', 'beast').length, 0);
});

test('Tainted: kast vereist A Strange Door én het gewone personage', () => {
  const noChar = achStatus(model, state([635]), 475); // Tainted Magdalene
  assert.equal(noChar.status, 'locked');
  assert.ok(noChar.missing.some((r) => r.char === 'magdalene'));
  assert.equal(achStatus(model, state([1, 635]), 475).status, 'open');
  assert.equal(achStatus(model, state([1]), 475).status, 'locked');
});

test('Hush-mark zonder Blue Womb (#234) is op slot', () => {
  assert.ok(markAccess(model, state([4]), 'isaac', 'hush').some((r) => r.ach === 234));
});

test('The Lost vereist Missing Poster; The Forgotten de Negative en een Lamb-kill', () => {
  assert.equal(achStatus(model, state([]), 82).status, 'locked');
  assert.equal(achStatus(model, state([149]), 82).status, 'open');
  assert.equal(achStatus(model, state([], { counters: { lambKills: 1 } }), 390).status, 'locked');
  assert.equal(achStatus(model, state([78], { counters: { lambKills: 0 } }), 390).status, 'locked');
  assert.equal(achStatus(model, state([78], { counters: { lambKills: 1 } }), 390).status, 'open');
});

test('Dead God pas als al het andere binnen is', () => {
  const all = data.map((a) => a.id).filter((id) => id !== 637);
  assert.equal(achStatus(model, state(all.slice(1)), 637).status, 'locked');
  assert.equal(achStatus(model, state(all), 637).status, 'open');
});

test('mark zetten levert beloning op en terugzetten haalt hem weg', () => {
  const s = state([4]);
  const { added } = setMark(model, s, 'isaac', 'heart', 2);
  assert.ok(added.includes(167), 'Lost Baby');
  assert.ok(s.achievements.has(167));
  const { removed } = setMark(model, s, 'isaac', 'heart', 1);
  assert.ok(removed.includes(167));
  assert.ok(!s.achievements.has(167));
});

test('Mother verslaan (met wie dan ook) geeft A Strange Door en Jacob & Esau', () => {
  const s = state([4, 407]);
  s.marks.eden[MARK_INDEX.mother] = 1;
  const imp = impliedAchievements(model, s);
  for (const id of [635, 405, 458]) assert.ok(imp.has(id), String(id));
});

test('tainted groepsmark: pas beloning als alle vier binnen zijn', () => {
  const s = state([474]);
  for (const mk of ['isaac', 'bluebaby', 'satan']) s.marks['t-isaac'][MARK_INDEX[mk]] = 1;
  assert.ok(!impliedAchievements(model, s).has(548));
  s.marks['t-isaac'][MARK_INDEX.lamb] = 1;
  assert.ok(impliedAchievements(model, s).has(548));
});

test('Steam vult alleen aan en zet marks hooguit op normal', () => {
  const s = state([1, 2]);
  s.marks.isaac[MARK_INDEX.satan] = 2;
  applySteam(model, s, [43, 199]);
  assert.ok(s.achievements.has(1) && s.achievements.has(43) && s.achievements.has(199));
  assert.equal(s.marks.isaac[MARK_INDEX.satan], 2, 'hard blijft hard');
  assert.equal(s.marks.azazel[MARK_INDEX.greed], 1, 'Lilith = Azazel Greed');
});

test('advies: Missing No. wordt overgeslagen als Lazarus-plan', () => {
  const s = state([4, 80, 234, 320, 407, 57, 78, 155]);
  for (const p of plansFor(model, s, 'lazarus')) {
    assert.ok(!p.marks.includes('bossrush') || !p.gains.includes(105), p.name);
  }
});

test('advies: zonder Strange Door is Mother de topprioriteit', () => {
  const s = state([1, 4, 79, 81, 234, 320, 407, 57, 78, 155]);
  const [top] = bestRuns(model, s, 1);
  assert.equal(top.run, 'mother');
  assert.ok(top.fresh.includes(635));
});

test('snelle winst: 399/400 munten in de Donation-machine', () => {
  const s = state([134, 135, 136, 151, 152, 153], { counters: { donation: 399 } });
  assert.ok(quickWins(model, s).some((q) => q.id === 137 && q.left === 1));
});

test('unlock-uitleg: elke route-achievement heeft een eigen uitleg, geen fallback', async () => {
  const { effectOf } = await import('../web/js/logic.js');
  const { UNLOCK_EFFECTS, UNLOCK_FALLBACK } = await import('../web/data/unlock-effects.js');
  const ids = [...new Set(ROUTE.flatMap((s) => s.ach))];
  for (const id of ids) {
    const name = `#${id} ${model.byId.get(id).name}`;
    assert.ok(id in UNLOCK_EFFECTS, `${name} mist uitleg`);
    assert.ok(!(id in UNLOCK_FALLBACK), `${name} staat nog in UNLOCK_FALLBACK`);
    const e = effectOf(model, id);
    assert.equal(e.known, true, name);
    assert.ok(e.text.length > 15, name);
  }
  // Multiple achievements in one step each get their own text.
  for (const s of ROUTE.filter((r) => r.ach.length > 1)) {
    const known = s.ach.filter((id) => id in UNLOCK_EFFECTS).map((id) => effectOf(model, id).text);
    assert.equal(new Set(known).size, known.length, s.key);
  }
});

test('unlock-uitleg: bekende items en personages krijgen specifieke werking', async () => {
  const { effectOf } = await import('../web/js/logic.js');
  const item = effectOf(model, 6);
  assert.equal(item.known, true);
  assert.match(item.text, /Cube of Meat/);
  assert.match(item.text, /familiar|orbitaal/i);
  const character = effectOf(model, 1);
  assert.equal(character.known, true);
  assert.match(character.text, /Magdalene/);
  assert.match(character.text, /heart containers/i);
});

test('unlock-uitleg: onbekende ID houdt een veilige wiki-fallback', async () => {
  const { effectOf } = await import('../web/js/logic.js');
  const missing = effectOf(model, 99999);
  assert.equal(missing.known, false);
  assert.match(missing.text, /wiki/i);
});

test('unlock-uitleg: alle 641 achievements hebben een eigen uitleg zonder placeholder', async () => {
  const { effectOf } = await import('../web/js/logic.js');
  const missing = [];
  for (const a of data) {
    const e = effectOf(model, a.id);
    if (!e.known || /Nog geen uitleg|zie de wiki|Zie de wiki/.test(e.text) || e.text.length < 20) missing.push(`#${a.id} ${a.name}`);
  }
  assert.deepEqual(missing.slice(0, 20), [], `${missing.length} zonder uitleg`);
});
