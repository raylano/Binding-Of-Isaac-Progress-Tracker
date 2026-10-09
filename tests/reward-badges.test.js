import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildModel } from '../web/js/logic.js';
import { CHARACTERS } from '../web/data/characters.js';
import { ITEM_QUALITY, NO_QUALITY_SOURCE } from '../web/data/item-quality.js';
import { rewardBadge, rewardTypeOf, qualityBadge, REWARD_KIND_LABELS } from '../web/js/unlock-info.js';

const data = JSON.parse(fs.readFileSync(new URL('../web/data/achievements.json', import.meta.url)));
const model = buildModel(data);

// All achievements that a character's completion marks award.
const charRewards = () => CHARACTERS.flatMap((c) => Object.values(model.rewards[c.key] || {})
  .flatMap((r) => [...r[1], ...r[2]].map((id) => ({ char: c.key, id }))));

test('reward-badge: Q0-Q4 zijn allemaal zichtbaar bij character rewards', () => {
  const seen = new Set();
  for (const { char, id } of charRewards()) {
    const q = ITEM_QUALITY[id];
    if (!q) continue;
    const html = rewardBadge(id);
    assert.equal(html, qualityBadge(id), `${char} #${id}`);
    assert.match(html, new RegExp(`class="badge quality" data-quality="${q.quality}"[^>]*>Q${q.quality}<`), `${char} #${id}`);
    seen.add(q.quality);
  }
  assert.deepEqual([...seen].sort(), [0, 1, 2, 3, 4]);
  // Spot check: below Q4 too, the tier is shown next to the reward.
  assert.match(rewardBadge(43), /data-quality="4"[^>]*>Q4</); // Mom's Knife
  assert.match(rewardBadge(6), /data-quality="1"[^>]*>Q1</); // Cube of Meat
});

test('reward-badge: Bloody Crown krijgt "Trinket · geen Q-tier", geen tier', () => {
  assert.equal(model.byId.get(287).name, 'Bloody Crown');
  assert.equal(model.markOf.get(287).char, 'samson');
  assert.equal(ITEM_QUALITY[287], undefined);
  assert.equal(qualityBadge(287), '');
  assert.deepEqual(rewardTypeOf(287), { kind: 'trinket', label: 'Trinket' });
  const html = rewardBadge(287);
  assert.match(html, /class="badge reward-type" data-kind="trinket"/);
  assert.match(html, />Trinket · no Q tier</);
  assert.doesNotMatch(html, /quality|Q[0-4]</);
});

test('reward-badge: elke bekende soort zonder Quality krijgt een vertaald typelabel', () => {
  const expected = { trinket: 'Trinket', kaart: 'Card', rune: 'Rune', pil: 'Pill', pickup: 'Pickup', startpickup: 'Starting pickup' };
  assert.deepEqual(REWARD_KIND_LABELS, expected);
  for (const [id, r] of Object.entries(NO_QUALITY_SOURCE)) {
    const html = rewardBadge(id);
    assert.ok(html.includes(`>${expected[r.kind]} · no Q tier<`), `#${id} ${r.kind}`);
    assert.doesNotMatch(html, /data-quality/, `#${id}`);
  }
});

test('reward-badge: niet-item unlocks en gewone achievements krijgen geen badge', () => {
  let nonItem = 0;
  for (const { char, id } of charRewards()) {
    if (ITEM_QUALITY[id] || NO_QUALITY_SOURCE[id]) continue;
    assert.equal(rewardBadge(id), '', `${char} #${id} ${model.byId.get(id)?.name}`);
    nonItem++;
  }
  assert.ok(nonItem > 0, 'er zijn niet-item mark-unlocks om te controleren');
  for (const a of data) {
    if (!ITEM_QUALITY[a.id] && !NO_QUALITY_SOURCE[a.id]) assert.equal(rewardBadge(a.id), '', `#${a.id}`);
  }
  assert.equal(rewardBadge(999999), '');
});
