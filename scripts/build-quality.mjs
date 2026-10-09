// Builds web/data/item-quality.js from locally fetched sources (no network).
//
//   node scripts/build-quality.mjs [source-dir]           writes web/data/item-quality.js
//   node scripts/build-quality.mjs [source-dir] --check   writes nothing; exit 1 if the file differs
//
// The source directory (default /root/.hermes/cache/web, or $SOURCES_DIR) holds the
// extracted pages: wiki.gg "Items" (Quality column, with separate values per DLC
// version) and tboi.com "all-items" (Platinum God; ItemID/Quality, independent check).
//
// Which achievements are item unlocks follows from web/data/unlock-effects.js:
// only "(Passive|Active) item added to the pool" counts. Boss, challenge and
// starting-item unlocks therefore get no tier, even if an item has the same name.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UNLOCK_EFFECTS } from '../web/data/unlock-effects.js';

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--')) || process.env.SOURCES_DIR || '/root/.hermes/cache/web';
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const FILES = {
  wikiItems: 'bindingofisaacrebirth.wiki.gg-1c4493da60.md',
  tboi: 'www.tboi.com-5f45c58751.md',
};
const OUT = new URL('../web/data/item-quality.js', import.meta.url);

export const norm = (s) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[’`]/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

export const isItemUnlock = (id) => /^(?:Passive |Active )?[Ii]tem added to the pool/.test(UNLOCK_EFFECTS[id] || '');

// Kind of an item-like unlock without a collectible, from the start of UNLOCK_EFFECTS.
// The keys are fixed ids for REWARD_KIND_LABELS in web/js/unlock-info.js.
const KIND_PREFIXES = [
  [/^Trinket\b/, 'trinket'],
  [/^Card\b/, 'kaart'],
  [/^Rune\b/, 'rune'],
  [/^(?:Pill|Two pills)\b/, 'pil'],
  [/^Starting pickup\b/, 'startpickup'],
  [/^Pickup\b/, 'pickup'],
];
const kindOf = (id) => KIND_PREFIXES.find(([re]) => re.test(UNLOCK_EFFECTS[id] || ''))?.[1] || 'onbekend';

// Quality cell from the wiki. Two forms:
//   "| 2 |"                                              applies to all versions
//   "| ![(except in Repentance+)](…)2![(in Repentance+)](…)1 |"   old / Repentance+
// So the first value is NOT the current one; Repentance+ follows "(in Repentance+)".
export function parseQualityCell(cell) {
  const plus = /\(in Repentance\+\)\]\([^)]*\)\s*([0-4])/.exec(cell);
  const pre = /\(except in Repentance\+\)\]\([^)]*\)\s*([0-4])/.exec(cell);
  if (plus && pre) return { quality: Number(plus[1]), repentance: Number(pre[1]) };
  const single = /^\s*([0-4])\s*$/.exec(cell);
  return single ? { quality: Number(single[1]), repentance: Number(single[1]) } : null;
}

function build() {
  // wiki.gg Items: collectibles only (ID 5.100.N); the last column is Quality.
  const wiki = new Map();
  const unreadable = [];
  for (const l of read(FILES.wikiItems).split('\n')) {
    const cells = l.split(' | ');
    const id = /^5\.100\.(\d+)$/.exec(cells[1]?.trim() || '');
    if (!id) continue;
    const name = /\[([^\]]+)\]\(https:\/\/bindingofisaacrebirth\.wiki\.gg\/wiki\/[^)]*\)/
      .exec(cells[0].replace(/^\| /, '').replace(/^!\[[^\]]*\]\([^)]*\)/, ''))?.[1];
    const q = parseQualityCell(cells[cells.length - 1].replace(/\s*\|\s*$/, ''));
    if (!name || !q) { unreadable.push(`5.100.${id[1]}`); continue; }
    wiki.set(norm(name), { name, itemId: Number(id[1]), ...q });
  }

  // tboi.com: blocks "Name / ItemID: N / "quote" / Quality: Q". Covers up to Repentance.
  const tboi = new Map();
  const tl = read(FILES.tboi).split('\n');
  for (let i = 0; i < tl.length; i++) {
    const m = /^ItemID: (\d+)$/.exec(tl[i].trim());
    if (!m) continue;
    for (let j = i + 1; j < i + 8 && j < tl.length; j++) {
      const qm = /^Quality: (\d)$/.exec(tl[j].trim());
      if (qm) { tboi.set(Number(m[1]), Number(qm[1])); break; }
    }
  }

  const achievements = JSON.parse(fs.readFileSync(new URL('../web/data/achievements.json', import.meta.url)));
  const records = [];
  const noSource = [];
  for (const a of achievements) {
    const hit = isItemUnlock(a.id) && (wiki.get(norm(a.page || a.name)) || wiki.get(norm(a.name)));
    if (hit) {
      records.push({ ach: a.id, ...hit, tboi: tboi.get(hit.itemId) ?? null });
    } else if (isItemUnlock(a.id) || /^unlocked a new item\.?$/i.test(a.unlock || '')) {
      // Achievement called "an item" that is not a collectible (trinket, card, ...).
      noSource.push({ ach: a.id, page: a.page || a.name, kind: kindOf(a.id) });
    }
  }

  const changed = records.filter((r) => r.repentance !== r.quality);
  // Real source conflicts: tboi differs and the wiki mentions no Repentance+ change.
  const conflicts = records.filter((r) => r.tboi !== null && r.tboi !== r.repentance && r.tboi !== r.quality);
  const tboiIsPlus = changed.filter((r) => r.tboi === r.quality);

  const lines = [
    '// Item Quality (0-4) per item unlock, generated by scripts/build-quality.mjs.',
    '// Do not edit by hand; rerun the script (--check verifies).',
    '//',
    '// Item unlock = UNLOCK_EFFECTS starts with "(Passive|Active) item added to the pool".',
    '// Mapping: achievements.json `page` (or `name`) == item name of a collectible',
    '// (ID 5.100.N) on https://bindingofisaacrebirth.wiki.gg/wiki/Items.',
    '// `quality` is the Repentance+ value (wiki: "(in Repentance+)", otherwise the only value).',
    '// `tboi` is the Quality from https://www.tboi.com/all-items (Platinum God) for the same',
    '// ItemID; that site covers up to Repentance, so no Repentance+ changes.',
    '',
    'export const ITEM_QUALITY = {',
    ...records.map((r) => `  ${r.ach}: { item: ${JSON.stringify(r.name)}, itemId: ${r.itemId}, quality: ${r.quality}, tboi: ${r.tboi} },`),
    '};',
    '',
    '// Items for which the wiki lists a different Quality before Repentance+: [Repentance, Repentance+].',
    '// Explains nearly all differences with tboi.com, which still shows the Repentance value.',
    'export const REPENTANCE_PLUS_CHANGES = {',
    ...changed.map((r) => `  ${r.ach}: [${r.repentance}, ${r.quality}],`),
    '};',
    '',
    '// Unresolved differences: the wiki gives one value for all versions, tboi.com another.',
    '// The app shows the wiki value (the only source that tracks Repentance+).',
    'export const QUALITY_CONFLICTS = {',
    ...conflicts.map((r) => `  ${r.ach}: { wiki: ${r.quality}, tboi: ${r.tboi} },`),
    '};',
    '',
    '// Achievements named as an item ("Unlocked a new item.") that are not collectibles',
    '// (trinket, card, rune, pill, pickup): Quality only exists for collectibles.',
    'export const NO_QUALITY_SOURCE = {',
    ...noSource.map((m) => `  ${m.ach}: { page: ${JSON.stringify(m.page)}, kind: ${JSON.stringify(m.kind)} },`),
    '};',
    '',
  ];
  const text = lines.join('\n');
  const report = [
    `wiki-collectibles: ${wiki.size}, tboi-items: ${tboi.size}, item-unlocks met tier: ${records.length}, zonder bron: ${noSource.length}`,
    `Repentance+-wijzigingen: ${changed.length} (tboi = Repentance-waarde: ${changed.length - tboiIsPlus.length}, tboi = Repentance+-waarde: ${tboiIsPlus.length})`,
    `onleesbare wiki-rijen (overgeslagen): ${unreadable.length ? unreadable.join(', ') : 'geen'}`,
    `onopgeloste conflicten: ${conflicts.length}`,
    ...conflicts.map((r) => `  #${r.ach} ${r.name}: wiki ${r.quality}, tboi ${r.tboi}`),
  ];
  return { text, report };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { text, report } = build();
  console.log(report.join('\n'));
  if (args.includes('--check')) {
    const same = fs.readFileSync(OUT, 'utf8') === text;
    console.log(same ? 'item-quality.js is actueel.' : 'item-quality.js wijkt af; draai zonder --check.');
    process.exit(same ? 0 : 1);
  }
  fs.writeFileSync(OUT, text);
}
