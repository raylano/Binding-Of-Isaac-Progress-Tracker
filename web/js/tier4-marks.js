// Which of a character's completion marks add a Tier 4 item (Item Quality 4) to the
// pool. Pure, so it can be tested without a browser.
//
// Mapping without guesswork of our own: mark -> achievement comes from model.rewards
// (buildModel, from the wiki text "Defeat X as Y"), achievement -> tier from
// ITEM_QUALITY (only real item unlocks, Repentance+ value). If an item is in
// QUALITY_CONFLICTS and only one of the two sources says Q4, the mapping is
// ambiguous: that item goes into `unclear` and does not count as Tier 4.

import { MARK_DISPLAY } from '../data/characters.js';
import { ITEM_QUALITY, QUALITY_CONFLICTS } from '../data/item-quality.js';
import { itemQualityOf } from './unlock-info.js';

const order = (marks) => (marks.length === 12 ? MARK_DISPLAY.length : Math.min(...marks.map((m) => MARK_DISPLAY.indexOf(m))));

export function isTier4(id) {
  return ITEM_QUALITY[id]?.quality === 4 && !unclearTier4(id);
}

// Conflict where one source says Q4 and the other does not.
export function unclearTier4(id) {
  const c = QUALITY_CONFLICTS[id];
  return !!c && (c.wiki === 4) !== (c.tboi === 4);
}

// tier4: the Tier 4 items per (mark or mark group, level); other: marks without a Tier 4 item;
// unclear: ambiguous mappings that do not count as Tier 4.
export function tier4MarkUnlocks(model, charKey) {
  const rewards = model.rewards[charKey];
  if (!rewards) return { tier4: [], other: [], unclear: [] };
  const tier4 = [];
  const unclear = [];
  const slots = Object.entries(rewards).sort(([, a], [, b]) => order(a.marks) - order(b.marks));
  for (const [slot, r] of slots) {
    for (const level of [1, 2]) {
      for (const id of r[level]) {
        const a = model.byId.get(id);
        const entry = { id, name: a?.name || `#${id}`, slot, marks: r.marks, level };
        if (unclearTier4(id)) {
          const c = QUALITY_CONFLICTS[id];
          unclear.push({ ...entry, item: ITEM_QUALITY[id].item, reason: `wiki Q${c.wiki}, tboi.com Q${c.tboi}` });
        } else if (isTier4(id)) {
          const q = itemQualityOf(id);
          tier4.push({ ...entry, item: q.item, itemId: ITEM_QUALITY[id].itemId, note: q.note });
        }
      }
    }
  }
  // "All 12 marks" does not make every individual mark a Tier 4 mark.
  const covered = new Set(tier4.filter((t) => t.marks.length < 12).flatMap((t) => t.marks));
  const other = MARK_DISPLAY.filter((mk) => !covered.has(mk));
  return { tier4, other, unclear };
}
