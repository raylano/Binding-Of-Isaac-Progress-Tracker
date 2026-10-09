// Fixed game data: the 12 completion marks and the 34 characters.
//
// The order of MARKS and CHARACTERS is the order in the save file and so must not
// change. Verified against REPENTOGON's EventCounter list
// (repentogon.com/enums/EventCounter.html) and against a real Repentance+ save.

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

// Display order on the note, as in the game: first the story, then the side
// branches, then Repentance.
export const MARK_DISPLAY = [
  'heart', 'isaac', 'bluebaby', 'satan', 'lamb', 'megasatan',
  'bossrush', 'hush', 'delirium', 'greed', 'mother', 'beast',
];

// What you must have unlocked before a final boss is reachable. Achievement IDs;
// an array inside an array means "one of these".
//   4   The Womb        57  The Polaroid (The Chest)   78  The Negative (Dark Room)
//   155 Angels (key pieces)       234 Blue Womb   320 The Void   407 A Secret Exit
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

// The Hard variant of Greed is called Greedier and has its own lock.
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

// Tainted names as the wiki uses them in "as Tainted X".
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
    // The closet in Home: 474 (Isaac) through 490 (Jacob and Esau), in save order.
    unlock: 474 + i,
  })),
];

export const CHAR_BY_KEY = Object.fromEntries(CHARACTERS.map((c) => [c.key, c]));
