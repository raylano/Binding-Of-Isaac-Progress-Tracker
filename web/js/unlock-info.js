// Extra explanation for an unlock: Item Quality (only real item unlocks) and the
// challenge tip. Pure, so it can be tested without a browser.
//
// Quality label: External Item Descriptions (EID) shows Quality with the glyphs
// {{Quality0}}..{{Quality4}}; those are frames 0-4 of animation "Quality" (10x10) in
// gfx/eid_inline_icons.anm2, drawn untinted (main.lua renderIcon). So the tier colour
// lives in the pixels of eid_inline_icons.png: QUALITY_COLORS is, per frame
// (crop x=44/55/66/77/88, y=32, 10x10), the dominant filled RGB colour. The CSS
// colours .badge.quality[data-quality] with these; the test guards that they stay equal.
export const QUALITY_COLORS = ['#C2C2C2', '#90FF51', '#65D5FF', '#FF54EC', '#FFD100'];

import { ITEM_QUALITY, REPENTANCE_PLUS_CHANGES, QUALITY_CONFLICTS, NO_QUALITY_SOURCE } from '../data/item-quality.js';
import { CHALLENGE_TIPS } from '../data/challenge-tips.js';

export function itemQualityOf(id) {
  const r = ITEM_QUALITY[id];
  if (!r) return null;
  const change = REPENTANCE_PLUS_CHANGES[id];
  const conflict = QUALITY_CONFLICTS[id];
  let note = '';
  if (change) note = `Before Repentance+ this was Q${change[0]}.`;
  else if (conflict) note = `tboi.com lists Q${conflict.tboi}; the wiki (also for Repentance+) lists Q${conflict.wiki}.`;
  return { quality: r.quality, item: r.item, label: `Q${r.quality}`, eid: `{{Quality${r.quality}}}`, hex: QUALITY_COLORS[r.quality], note };
}

// Badge for list and drawer; empty for anything that is not an item unlock.
export function qualityBadge(id) {
  const q = itemQualityOf(id);
  if (!q) return '';
  return `<span class="badge quality" data-quality="${q.quality}" title="Item Quality ${q.quality} of 4 (EID ${q.eid})">${q.label}</span>`;
}

// Item-like unlocks without collectible Quality (NO_QUALITY_SOURCE.kind).
export const REWARD_KIND_LABELS = {
  trinket: 'Trinket',
  kaart: 'Card',
  rune: 'Rune',
  pil: 'Pill',
  pickup: 'Pickup',
  startpickup: 'Starting pickup',
};

export function rewardTypeOf(id) {
  const r = NO_QUALITY_SOURCE[id];
  if (!r) return null;
  return { kind: r.kind, label: REWARD_KIND_LABELS[r.kind] || r.kind };
}

// Badge next to a reward chip: Q0-Q4 for collectibles, a type badge for
// trinkets/cards/etc. (never a made-up tier), empty for non-item unlocks.
export function rewardBadge(id) {
  const q = qualityBadge(id);
  if (q) return q;
  const t = rewardTypeOf(id);
  if (!t) return '';
  return `<span class="badge reward-type" data-kind="${t.kind}" title="${t.label}: not a collectible, so no Item Quality">${t.label} · no Q tier</span>`;
}

// Challenge number for an achievement: first the achievement that makes the
// challenge available (model.challengeUnlock), then the reward ("... (challenge #N)").
// Order matters: Glass Cannon (#164) opens challenge #11, but its "how" also
// mentions "Beat The Family Man (challenge #19)" as a requirement.
export function challengeOf(model, id) {
  const hit = Object.entries(model.challengeUnlock).find(([, ach]) => ach === id);
  if (hit) return Number(hit[0]);
  const m = /\(challenge #(\d+)\)/i.exec(model.byId.get(id)?.how || '');
  return m ? Number(m[1]) : null;
}

export function challengeTipOf(model, id) {
  const n = challengeOf(model, id);
  return n && CHALLENGE_TIPS[n] ? { n, ...CHALLENGE_TIPS[n] } : null;
}
