import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildModel } from '../web/js/logic.js';
import { CHARACTERS, MARK_DISPLAY } from '../web/data/characters.js';
import { ITEM_QUALITY, QUALITY_CONFLICTS } from '../web/data/item-quality.js';
import { tier4MarkUnlocks, isTier4, unclearTier4 } from '../web/js/tier4-marks.js';

const data = JSON.parse(fs.readFileSync(new URL('../web/data/achievements.json', import.meta.url)));
const model = buildModel(data);
const brief = (r) => r.tier4.map((t) => [t.slot, t.level, t.id, t.item]);

test('tier4: precies deze mark-unlocks per personage geven een Q4-item', () => {
  const expected = {
    isaac: [['satan', 1, 43, "Mom's Knife"], ['delirium', 1, 282, 'D infinity']],
    lost: [['all', 2, 156, 'Godhead']],
    lilith: [['hush', 1, 190, 'Incubus'], ['beast', 1, 463, 'C Section']],
    bethany: [['mother', 1, 470, 'Revelation']],
    jacob: [['bossrush', 1, 433, 'Rock Bottom']],
    't-isaac': [['delirium', 1, 584, 'Spindown Dice'], ['beast', 1, 491, 'Glitched Crown']],
    't-lazarus': [['delirium', 1, 592, 'Flip']],
    't-lost': [['beast', 1, 501, 'Sacred Orb']],
    't-lilith': [['beast', 1, 502, 'Twisted Pair']],
  };
  for (const c of CHARACTERS) {
    assert.deepEqual(brief(tier4MarkUnlocks(model, c.key)), expected[c.key] || [], c.key);
  }
});

test('tier4: alleen echte Q4-item-unlocks, geen lagere tiers of niet-items', () => {
  for (const c of CHARACTERS) {
    const r = tier4MarkUnlocks(model, c.key);
    for (const t of r.tier4) {
      assert.equal(ITEM_QUALITY[t.id].quality, 4, `#${t.id}`);
      assert.equal(model.markOf.get(t.id).char, c.key, `#${t.id}`);
      assert.deepEqual(model.markOf.get(t.id).marks, t.marks, `#${t.id}`);
    }
  }
  // tboi.com says Q4, Repentance+ Q3: does not count.
  assert.deepEqual(brief(tier4MarkUnlocks(model, 'azazel')), []); // Satanic Bible #126
  assert.deepEqual(brief(tier4MarkUnlocks(model, 'apollyon')), []); // Void #295
  assert.deepEqual(brief(tier4MarkUnlocks(model, 't-apollyon')), []); // Abyss #597
  // Mark unlocks without Quality (character, trinket) and lower tiers are left out.
  assert.equal(isTier4(1), false);
  assert.equal(isTier4(52), false);
  assert.equal(isTier4(6), false);
  assert.equal(isTier4(43), true);
});

test('tier4: Q4-unlocks die niet aan één personage hangen verschijnen nergens', () => {
  // Counter, challenge, donation, "all characters": not a mark of a single character.
  const shown = new Set(CHARACTERS.flatMap((c) => tier4MarkUnlocks(model, c.key).tier4.map((t) => t.id)));
  for (const id of [11, 62, 138, 140, 276, 377, 547, 636]) {
    assert.equal(ITEM_QUALITY[id].quality, 4, `#${id}`);
    assert.equal(model.markOf.get(id), undefined, `#${id}`);
    assert.ok(!shown.has(id), `#${id}`);
  }
});

test('tier4: andere marks staan apart; "alle 12" telt niet per losse mark', () => {
  const isaac = tier4MarkUnlocks(model, 'isaac');
  assert.deepEqual(isaac.other, MARK_DISPLAY.filter((mk) => mk !== 'satan' && mk !== 'delirium'));
  const lost = tier4MarkUnlocks(model, 'lost');
  assert.equal(lost.tier4.length, 1);
  assert.deepEqual(lost.other, MARK_DISPLAY);
});

test('tier4: lege gevallen', () => {
  const magdalene = tier4MarkUnlocks(model, 'magdalene');
  assert.deepEqual(magdalene.tier4, []);
  assert.deepEqual(magdalene.other, MARK_DISPLAY);
  assert.deepEqual(magdalene.unclear, []);
  assert.deepEqual(tier4MarkUnlocks(model, 'bestaat-niet'), { tier4: [], other: [], unclear: [] });
  const empty = buildModel([]);
  for (const c of CHARACTERS) assert.deepEqual(tier4MarkUnlocks(empty, c.key).tier4, [], c.key);
});

test('tier4: ambigue Quality-koppelingen worden gemeld, niet geraden', () => {
  // None of the current conflicts involve Q4, so nothing is unclear right now.
  for (const id of Object.keys(QUALITY_CONFLICTS)) assert.equal(unclearTier4(id), false, `#${id}`);
  for (const c of CHARACTERS) assert.deepEqual(tier4MarkUnlocks(model, c.key).unclear, [], c.key);
});
