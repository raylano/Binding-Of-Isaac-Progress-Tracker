import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { buildModel } from '../web/js/logic.js';
import {
  ITEM_QUALITY, REPENTANCE_PLUS_CHANGES, QUALITY_CONFLICTS, NO_QUALITY_SOURCE,
} from '../web/data/item-quality.js';
import { CHALLENGE_TIPS } from '../web/data/challenge-tips.js';
import { itemQualityOf, qualityBadge, challengeOf, challengeTipOf, QUALITY_COLORS } from '../web/js/unlock-info.js';
import { isItemUnlock, parseQualityCell } from '../scripts/build-quality.mjs';

const data = JSON.parse(fs.readFileSync(new URL('../web/data/achievements.json', import.meta.url)));
const model = buildModel(data);
const isTier = (q) => Number.isInteger(q) && q >= 0 && q <= 4;
const key = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

test('quality: alle tiers (Repentance+, Repentance, tboi) liggen in 0-4', () => {
  for (const [id, r] of Object.entries(ITEM_QUALITY)) {
    assert.ok(isTier(r.quality), `#${id} quality ${r.quality}`);
    assert.ok(r.tboi === null || isTier(r.tboi), `#${id} tboi ${r.tboi}`);
    assert.ok(Number.isInteger(r.itemId) && r.itemId > 0, `#${id} itemId`);
  }
  for (const [id, pair] of Object.entries(REPENTANCE_PLUS_CHANGES)) assert.ok(pair.every(isTier), `#${id}`);
});

test('quality: elke item-unlock heeft een tier, elke "nieuw item" zonder collectible een reden', () => {
  const kinds = new Set(['trinket', 'rune', 'kaart', 'pil', 'pickup', 'startpickup']);
  for (const a of data) {
    const tier = ITEM_QUALITY[a.id];
    const reason = NO_QUALITY_SOURCE[a.id];
    assert.ok(!(tier && reason), `#${a.id} heeft zowel tier als reden`);
    if (isItemUnlock(a.id)) assert.ok(tier, `item-unlock #${a.id} ${a.name} zonder tier`);
    if (/^unlocked a new item\.?$/i.test(a.unlock)) assert.ok(tier || reason, `#${a.id} ${a.name}: geen tier en geen reden`);
    if (tier) assert.ok(isItemUnlock(a.id), `#${a.id} ${a.name} heeft een tier maar is geen item-unlock`);
    if (reason) {
      assert.ok(kinds.has(reason.kind), `#${a.id} onbekende soort ${reason.kind}`);
      assert.ok(reason.page, `#${a.id} zonder pagina`);
    }
  }
  assert.equal(Object.keys(ITEM_QUALITY).length, 270);
  assert.equal(Object.keys(NO_QUALITY_SOURCE).length, 87);
});

test('quality: geen tier voor baas-, challenge- en startitem-unlocks met een itemnaam', () => {
  // 16 = boss Steven, 29 = Isaac starts with The D6, 164/268 = challenges Glass Cannon/PAY TO PLAY.
  for (const id of [16, 29, 164, 268]) assert.equal(ITEM_QUALITY[id], undefined, `#${id}`);
  assert.equal(ITEM_QUALITY[491].item, 'Glitched Crown'); // collectible 5.100.689, not a trinket
  assert.equal(NO_QUALITY_SOURCE[52].kind, 'trinket'); // Curved Horn
});

test('quality: elk verschil met tboi.com is verklaard (Repentance+-wijziging of gedocumenteerd conflict)', () => {
  for (const [id, r] of Object.entries(ITEM_QUALITY)) {
    if (r.tboi === null || r.tboi === r.quality) continue;
    const change = REPENTANCE_PLUS_CHANGES[id];
    assert.ok(change?.[0] === r.tboi || QUALITY_CONFLICTS[id], `#${id} ${r.item}: wiki ${r.quality}, tboi ${r.tboi} onverklaard`);
  }
  for (const [id, [, plus]] of Object.entries(REPENTANCE_PLUS_CHANGES)) assert.equal(ITEM_QUALITY[id].quality, plus, `#${id}`);
  for (const [id, c] of Object.entries(QUALITY_CONFLICTS)) {
    assert.equal(ITEM_QUALITY[id].quality, c.wiki, `#${id}`);
    assert.equal(ITEM_QUALITY[id].tboi, c.tboi, `#${id}`);
    assert.equal(REPENTANCE_PLUS_CHANGES[id], undefined, `#${id}`);
  }
  assert.deepEqual(Object.keys(QUALITY_CONFLICTS).map(Number), [114, 318, 591]);
});

test('quality-parser: Repentance+-waarde staat achter "(in Repentance+)", niet vooraan', () => {
  const dual = '![(except in Repentance+)](https://x/Dlc_nr%2B_indicator.png?a61fe4)2![(in Repentance+)](https://x/Dlc_r%2B_indicator.png?b734d6)1';
  assert.deepEqual(parseQualityCell(dual), { quality: 1, repentance: 2 });
  assert.deepEqual(parseQualityCell(' 3 '), { quality: 3, repentance: 3 });
  assert.equal(parseQualityCell('Quality'), null);
  assert.equal(parseQualityCell('7'), null);
});

const SOURCES = process.env.SOURCES_DIR || '/root/.hermes/cache/web';
test('quality: item-quality.js is gelijk aan de uitvoer van de generator', { skip: !fs.existsSync(SOURCES) && 'bronnen niet aanwezig' }, () => {
  execFileSync(process.execPath, ['scripts/build-quality.mjs', SOURCES, '--check'], { cwd: new URL('..', import.meta.url) });
});

test('challenges: tips voor precies #1-#45, elk met wiki-bron en eigen beloning', () => {
  assert.deepEqual(Object.keys(CHALLENGE_TIPS).map(Number), Array.from({ length: 45 }, (_, i) => i + 1));
  for (let n = 1; n <= 45; n++) {
    const t = CHALLENGE_TIPS[n];
    assert.match(t.src, /^https:\/\/bindingofisaacrebirth\.wiki\.gg\/wiki\/\S+$/, `#${n} bron`);
    assert.ok(t.tip.length >= 120 && t.tip.length <= 500, `#${n} tiplengte ${t.tip.length}`);
    assert.doesNotMatch(t.tip, /\\u|TODO|\?\?\?\?/, `#${n} tiptekst`);
    // Rewards: "Complete <name> (challenge #N)". Other mentions of #N (e.g.
    // Glass Cannon #164: "Beat The Family Man (challenge #19)") are requirements.
    const re = new RegExp(`Complete (.+?) \\(challenge #${n}\\)`, 'i');
    const rewards = data.filter((a) => re.test(a.how) && !/^Unlocked Challenge #/i.test(a.unlock));
    assert.ok(rewards.length >= 1, `#${n}: geen beloning`);
    for (const r of rewards) {
      const name = re.exec(r.how)[1];
      assert.equal(key(t.name), key(name), `#${n}: tip "${t.name}" vs achievement #${r.id} "${name}"`);
      assert.equal(challengeOf(model, r.id), n, `#${r.id}`);
      assert.equal(challengeTipOf(model, r.id).src, t.src, `#${r.id}`);
    }
  }
});

test('challenges: een challenge-unlock wint van een "(challenge #N)"-voorwaarde in how', () => {
  assert.equal(challengeOf(model, 164), 11); // Glass Cannon: "Unlocked Challenge #11.", how mentions #19
  assert.equal(challengeTipOf(model, 164).name, CHALLENGE_TIPS[11].name);
  assert.equal(challengeOf(model, 62), 19); // Epic Fetus: reward of The Family Man
  assert.equal(challengeOf(model, 165), 19); // The Family Man: "Unlocked Challenge #19."
});

test('challenges: de unlock van een challenge toont dezelfde tip', () => {
  const unlocks = Object.entries(model.challengeUnlock);
  assert.ok(unlocks.length > 0);
  for (const [n, id] of unlocks) {
    assert.ok(CHALLENGE_TIPS[n], `challenge #${n} zonder tip`);
    assert.equal(challengeTipOf(model, id).n, Number(n), `#${id}`);
  }
  assert.equal(challengeTipOf(model, 160).name, 'Suicide King'); // "Unlocked Challenge #7."
  assert.equal(challengeTipOf(model, 1), null); // Magdalene: no challenge
});

test('UI-helpers: Q-badge alleen voor item-unlocks, met EID-glyphlabel en notitie', () => {
  const meat = itemQualityOf(6);
  assert.deepEqual([meat.quality, meat.label, meat.eid], [1, 'Q1', '{{Quality1}}']);
  assert.match(meat.note, /Q2/);
  assert.equal(itemQualityOf(11).note, ''); // Dr. Fetus: no change
  assert.match(itemQualityOf(114).note, /tboi\.com lists Q2/);
  assert.match(qualityBadge(6), /class="badge quality" data-quality="1"[^>]*>Q1</);
  assert.doesNotMatch(qualityBadge(6), /color|style=/);
  for (const id of [1, 16, 52, 164, 99999]) {
    assert.equal(itemQualityOf(id), null, `#${id}`);
    assert.equal(qualityBadge(id), '', `#${id}`);
  }
});

test('Q-kleuren: exact de dominante RGB van EID-frames Quality0-4, ook in de CSS, leesbaar met inkt', () => {
  // From eid_inline_icons.png, animation "Quality" (crop x=44/55/66/77/88, y=32, 10x10).
  const eidRgb = [[194, 194, 194], [144, 255, 81], [101, 213, 255], [255, 84, 236], [255, 209, 0]];
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  assert.deepEqual(QUALITY_COLORS.map(rgb), eidRgb);
  assert.deepEqual(QUALITY_COLORS, ['#C2C2C2', '#90FF51', '#65D5FF', '#FF54EC', '#FFD100']);

  const css = fs.readFileSync(new URL('../web/css/style.css', import.meta.url), 'utf8');
  const cssColors = {};
  for (const m of css.matchAll(/\.badge\.quality\[data-quality="(\d)"\]\s*\{\s*--q:\s*(#[0-9A-Fa-f]{6})\s*;/g)) cssColors[m[1]] = m[2].toUpperCase();
  assert.deepEqual(cssColors, Object.fromEntries(QUALITY_COLORS.map((c, q) => [String(q), c])));
  assert.match(css, /\.badge\.quality\s*\{[^}]*color:\s*var\(--ink\)[^}]*background:\s*var\(--q/);

  const ink = css.match(/--ink:\s*(#[0-9a-fA-F]{6})/)[1];
  const lum = (hex) => {
    const [r, g, b] = rgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  for (const [q, c] of QUALITY_COLORS.entries()) {
    const ratio = (lum(c) + 0.05) / (lum(ink) + 0.05);
    assert.ok(ratio >= 4.5, `Q${q} ${c} op inkt ${ink}: contrast ${ratio.toFixed(2)}`);
    const id = Object.keys(ITEM_QUALITY).find((k) => ITEM_QUALITY[k].quality === q);
    assert.equal(itemQualityOf(id).hex, c, `Q${q}`);
    assert.match(qualityBadge(id), new RegExp(`data-quality="${q}"[^>]*>Q${q}<`));
  }
});
