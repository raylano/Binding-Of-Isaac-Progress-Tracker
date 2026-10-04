// Vaste spelgegevens: de 12 completion marks en de 34 personages.
//
// De volgorde van MARKS en CHARACTERS is de volgorde in het save-bestand en mag dus
// niet veranderen. Geverifieerd tegen de EventCounter-lijst van REPENTOGON
// (repentogon.com/enums/EventCounter.html) en tegen een echte Repentance+-save.

export const MARKS = [
  { key: 'heart', short: 'MH', name: "Mom's Heart", long: "Mom's Heart / It Lives!" },
  { key: 'isaac', short: 'Is', name: 'Isaac', long: 'Isaac (Cathedral)' },
  { key: 'satan', short: 'Sa', name: 'Satan', long: 'Satan (Sheol)' },
  { key: 'bossrush', short: 'BR', name: 'Boss Rush', long: 'Boss Rush' },
  { key: 'bluebaby', short: '??', name: '???', long: '??? (The Chest)' },
  { key: 'lamb', short: 'La', name: 'The Lamb', long: 'The Lamb (Dark Room)' },
  { key: 'megasatan', short: 'MS', name: 'Mega Satan', long: 'Mega Satan' },
  { key: 'greed', short: 'Gr', name: 'Ultra Greed', long: 'Ultra Greed / Greedier' },
  { key: 'hush', short: 'Hu', name: 'Hush', long: 'Hush (Blue Womb)' },
  { key: 'delirium', short: 'De', name: 'Delirium', long: 'Delirium (The Void)' },
  { key: 'mother', short: 'Mo', name: 'Mother', long: 'Mother (Corpse)' },
  { key: 'beast', short: 'Be', name: 'The Beast', long: 'The Beast (Home)' },
];

export const MARK_INDEX = Object.fromEntries(MARKS.map((m, i) => [m.key, i]));

// Weergavevolgorde op het briefje, zoals in het spel: eerst het verhaal, dan de
// zijtakken, dan Repentance.
export const MARK_DISPLAY = [
  'heart', 'isaac', 'bluebaby', 'satan', 'lamb', 'megasatan',
  'bossrush', 'hush', 'delirium', 'greed', 'mother', 'beast',
];

// Wat je moet hebben ontgrendeld voordat een eindbaas bereikbaar is. Achievement-ID's;
// een array in een array betekent "een van deze".
//   4   The Womb        57  The Polaroid (The Chest)   78  The Negative (Dark Room)
//   155 Angels (sleutelstukken)   234 Blue Womb   320 The Void   407 A Secret Exit
//   635 A Strange Door  341 Greedier!
export const MARK_REQUIRES = {
  heart: [4],
  isaac: [4],
  satan: [4],
  bossrush: [],
  bluebaby: [4, 57],
  lamb: [4, 78],
  megasatan: [155, [57, 78]],
  greed: [],
  hush: [234],
  delirium: [320],
  mother: [407],
  beast: [635],
};

// Hard-variant van Greed heet Greedier en heeft een eigen vergrendeling.
export const GREEDIER = 341;

const BASE = [
  { key: 'isaac', name: 'Isaac', unlock: null },
  { key: 'magdalene', name: 'Magdalene', unlock: 1 },
  { key: 'cain', name: 'Cain', unlock: 2 },
  { key: 'judas', name: 'Judas', unlock: 3 },
  { key: 'bluebaby', name: '???', unlock: 32, alias: 'Blue Baby' },
  { key: 'eve', name: 'Eve', unlock: 42 },
  { key: 'samson', name: 'Samson', unlock: 67 },
  { key: 'azazel', name: 'Azazel', unlock: 79 },
  { key: 'lazarus', name: 'Lazarus', unlock: 80 },
  { key: 'eden', name: 'Eden', unlock: 81 },
  { key: 'lost', name: 'The Lost', unlock: 82 },
  { key: 'lilith', name: 'Lilith', unlock: 199 },
  { key: 'keeper', name: 'Keeper', unlock: 251 },
  { key: 'apollyon', name: 'Apollyon', unlock: 340 },
  { key: 'forgotten', name: 'The Forgotten', unlock: 390 },
  { key: 'bethany', name: 'Bethany', unlock: 404 },
  { key: 'jacob', name: 'Jacob and Esau', unlock: 405, short: 'Jacob & Esau' },
];

// Tainted-namen zoals de wiki ze in "as Tainted X" gebruikt.
const TAINTED_WIKI = {
  lost: 'Tainted Lost',
  forgotten: 'Tainted Forgotten',
  jacob: 'Tainted Jacob',
};

export const CHARACTERS = [
  ...BASE.map((c, i) => ({ ...c, index: i, tainted: false, wiki: c.name })),
  ...BASE.map((c, i) => ({
    key: `t-${c.key}`,
    name: TAINTED_WIKI[c.key] || `Tainted ${c.name}`,
    short: `T. ${c.short || c.name.replace(/^The /, '')}`,
    wiki: TAINTED_WIKI[c.key] || `Tainted ${c.name}`,
    index: BASE.length + i,
    tainted: true,
    base: c.key,
    // De kast in Home: 474 (Isaac) t/m 490 (Jacob and Esau), in save-volgorde.
    unlock: 474 + i,
  })),
];

export const CHAR_BY_KEY = Object.fromEntries(CHARACTERS.map((c) => [c.key, c]));
