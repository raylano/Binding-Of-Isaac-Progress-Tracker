// Meta route: the order the community guides recommend, merged together.
// A step is done once all its achievements are in. How to get something always
// comes from the wiki data (achievements.json), never from this text.

export const SOURCES = {
  JNUB: {
    name: 'Most & Least Important Unlocks (Repentance+)',
    url: 'https://steamcommunity.com/sharedfiles/filedetails/?id=2994836310',
  },
  PIEL: {
    name: 'Dead God Roadmap',
    url: 'https://steamcommunity.com/sharedfiles/filedetails/?id=2980920774',
  },
  TINF: {
    name: 'Dead God / Infinity route (Repentance+)',
    url: 'https://steamcommunity.com/sharedfiles/filedetails/?id=3712501774',
  },
  WIKI: {
    name: 'Binding of Isaac: Rebirth Wiki',
    url: 'https://bindingofisaacrebirth.wiki.gg/wiki/Achievements',
  },
};

export const PHASES = [
  { key: 'basis', name: 'Foundation', note: 'Strong items and your workhorse. Everything after goes faster.' },
  { key: 'void', name: 'Blue Womb & The Void', note: 'Hush opens The Void, and 3x Hush opens the alternate path.' },
  { key: 'mother', name: 'Mother', note: 'The most important unlock in Repentance: the Strange Door to Home.' },
  { key: 'tainted', name: 'Tainted', note: 'The closet in Home, opened with the Red Key. One tainted per run.' },
  { key: 'greed', name: 'Greed machine', note: 'Coins carry over between runs. Switch characters if you get stuck.' },
  { key: 'rest', name: 'Finishing characters', note: 'Apollyon, The Forgotten and The Lost (after Holy Mantle).' },
  { key: 'eind', name: 'Endgame', note: 'Hard mode marks, Godhead and finally Dead God.' },
];

export const ROUTE = [
  // Phase 1
  { key: 'azazel', phase: 'basis', title: 'Azazel as your workhorse', ach: [79],
    why: 'Flight + a Brimstone-like attack: by far the easiest character for general unlocks.',
    src: ['JNUB', 'PIEL', 'TINF'] },
  { key: 'runes', phase: 'basis', title: 'The six good runes', ach: [90, 91, 94, 93, 96, 233],
    why: 'Once these runes are in the pool, you get fewer loose rune shards. Jera and Perthro are strong.',
    src: ['JNUB', 'TINF'] },
  { key: 'lilith', phase: 'basis', title: 'Lilith via Azazel in Greed', ach: [199],
    why: 'Lilith opens Incubus and later C Section and Tainted Lilith; an easy Greed clear with Azazel.',
    src: ['JNUB', 'TINF'] },
  { key: 'endings', phase: 'basis', title: 'It Lives!, Polaroid and Negative', ach: [34, 57, 78],
    why: 'Without Polaroid/Negative there is no Chest or Dark Room, so no ???, Lamb or Mega Satan.',
    src: ['PIEL', 'TINF'] },
  { key: 'chaos', phase: 'basis', title: 'Chaos Card (Demo Man)', ach: [97],
    why: 'Kills most bosses in one throw; makes many tough fights trivial.', src: ['JNUB', 'TINF'] },
  { key: 'devil', phase: 'basis', title: "Mom's Knife and Satanic Bible", ach: [43, 126],
    why: 'Two of the strongest Devil deal items.', src: ['JNUB'] },
  { key: 'shop', phase: 'basis', title: 'Donation machine up to Stop Watch', ach: [151, 153, 154, 138],
    why: 'Bigger shops; later you can use bombs to get coins out of a full machine.',
    src: ['PIEL', 'JNUB'] },
  { key: 'dailies', phase: 'basis', title: 'Broken Modem (7 dailies)', ach: [354],
    why: 'Start dailies early; Broken Modem is a strong active item.', src: ['JNUB', 'PIEL'] },

  // Phase 2
  { key: 'void', phase: 'void', title: 'The Void (beat Hush)', ach: [320],
    why: 'Needed for Delirium and all Delirium unlocks.', src: ['JNUB', 'PIEL'] },
  { key: 'incubus', phase: 'void', title: 'Incubus (Hush as Lilith)', ach: [190],
    why: 'Doubles your tears with no downside. Make Lilith your first Hush character.', src: ['JNUB', 'TINF'] },
  { key: 'athame', phase: 'void', title: 'Athame (Hush as Eve)', ach: [184],
    why: 'Strong Devil deal item.', src: ['JNUB'] },
  { key: 'secretexit', phase: 'void', title: 'A Secret Exit (Hush 3x)', ach: [407],
    why: 'Opens Downpour, Mines and Mausoleum: the way to Mother.', src: ['JNUB', 'WIKI'] },
  { key: 'delirium', phase: 'void', title: 'Delirium: D infinity, Eden\'s Soul, Eucharist', ach: [338, 282, 289, 283],
    why: 'In Repentance+ the Void portal is guaranteed after Hush, ???, Lamb and Mega Satan.',
    src: ['JNUB', 'TINF'] },

  // Phase 3
  { key: 'bethany', phase: 'mother', title: 'Bethany (Lazarus, Hard, without dying)', ach: [404],
    why: 'Bethany is ideal for Mother. Do the run without Boss Rush: that would unlock Missing No.',
    src: ['TINF'] },
  { key: 'mother', phase: 'mother', title: 'Beat Mother: Strange Door + Jacob & Esau', ach: [635, 405],
    why: '"Single most important unlock": opens Home, The Beast and all tainted characters.',
    src: ['JNUB', 'TINF'] },
  { key: 'm', phase: 'mother', title: "'M (Mother as Eden)", ach: [458],
    why: 'Best trinket; the first Mother unlock worth getting.', src: ['JNUB'] },
  { key: 'goodstuff', phase: 'mother', title: 'The D6, Curved Horn, Stairway, Birthright', ach: [29, 52, 429, 431],
    why: 'Strong items that improve the pool considerably.', src: ['JNUB'] },

  // Phase 4
  { key: 't-lilith', phase: 'tainted', title: 'Tainted Lilith, C Section, Twisted Pair', ach: [485, 463, 502],
    why: 'Tainted Lilith is easy; C Section is probably the best tear replacement.', src: ['JNUB', 'TINF'] },
  { key: 't-isaac', phase: 'tainted', title: 'Tainted Isaac, Options?, Glitched Crown, Spindown Dice', ach: [474, 441, 491, 584],
    why: 'Glitched Crown is "D6 on steroids".', src: ['JNUB'] },
  { key: 't-lazarus', phase: 'tainted', title: 'Tainted Lazarus and Flip', ach: [482, 592],
    why: 'Flip is a safe Damocles variant.', src: ['JNUB'] },

  // Phase 5
  { key: 'greedier', phase: 'greed', title: 'Greedier! (500 coins)', ach: [341],
    why: 'A new mode, and Greedier marks count as the hard Greed mark.', src: ['JNUB', 'PIEL'] },
  { key: 'mantle', phase: 'greed', title: 'Holy Mantle for The Lost (879)', ach: [250],
    why: 'Only play The Lost once he starts with Holy Mantle.', src: ['JNUB', 'PIEL'] },
  { key: 'keeper', phase: 'greed', title: 'Keeper (1000 coins)', ach: [251],
    why: 'The last milestone of the Greed machine.', src: ['JNUB', 'PIEL'] },

  // Phase 6
  { key: 'apollyon', phase: 'rest', title: 'Apollyon (Mega Satan) and Void', ach: [340, 295],
    why: 'Void (Delirium as Apollyon) can break runs.', src: ['JNUB'] },
  { key: 'forgotten', phase: 'rest', title: 'The Forgotten (shovel quest)', ach: [390],
    why: 'A long quest; mind the extra conditions (The Lamb beaten at some point, no seed).', src: ['TINF', 'WIKI'] },
  { key: 'lost', phase: 'rest', title: 'The Lost', ach: [82],
    why: 'Feel free to unlock him, but only play his marks after Holy Mantle.', src: ['JNUB', 'PIEL'] },

  // Phase 7
  { key: 'godhead', phase: 'eind', title: 'Godhead (all Hard marks as The Lost)', ach: [156],
    why: 'Save this for last: The Lost on Hard is the toughest.', src: ['JNUB', 'TINF'] },
  { key: 'deadgod', phase: 'eind', title: 'Dead God', ach: [637],
    why: 'Everything. Including the 4 Repentance+ achievements.', src: ['WIKI'] },
];

// Unlocks the guides want to postpone. 'hard' = genuinely bad for your item pool,
// 'mild' = not terrible, but no rush.
export const AVOID = {
  105: { level: 'hard', why: 'Missing No. rerolls your items every floor; "worst item in the game".', src: ['JNUB', 'PIEL', 'TINF'] },
  565: { level: 'hard', why: 'Torn Card is a harmful trinket.', src: ['JNUB'] },
  30: { level: 'hard', why: 'The Scissors: "insufferably bad". Comes on its own at 100 deaths.', src: ['JNUB'] },
  500: { level: 'hard', why: 'TMTRAINER: glitch items, completely unpredictable.', src: ['JNUB'] },
  593: { level: 'hard', why: 'Corrupted Data: glitch items in your pool.', src: ['JNUB', 'PIEL'] },
  588: { level: 'hard', why: 'IBS blocks useful items.', src: ['JNUB'] },
  51: { level: 'hard', why: 'Abel is notoriously bad.', src: ['JNUB'] },
  116: { level: 'hard', why: "Lazarus' Rags ruins your Angel Room pool.", src: ['TINF'] },
  614: { level: 'mild', why: 'Rotten Beggar: the worst beggar type.', src: ['JNUB'] },
  472: { level: 'mild', why: 'Magic Skin only works well with Confessionals.', src: ['JNUB'] },
  240: { level: 'mild', why: 'Sticky Nickels are a downgrade from regular coins.', src: ['JNUB'] },
  285: { level: 'mild', why: 'Shade replaces Devil deal items.', src: ['JNUB'] },
  70: { level: 'mild', why: "Isaac's Head is a mediocre trinket.", src: ['JNUB'] },
  99: { level: 'mild', why: 'Rules Card clutters the card pool.', src: ['JNUB'] },
  133: { level: 'mild', why: 'The D100 is too chaotic.', src: ['JNUB'] },
  114: { level: 'mild', why: "???'s Only Friend is a weak familiar.", src: ['JNUB'] },
  580: { level: 'mild', why: 'RC Remote is a useless trinket.', src: ['JNUB'] },
  594: { level: 'mild', why: 'Ghost Bombs: mediocre for the effort.', src: ['JNUB'] },
  568: { level: 'mild', why: "Kid's Drawing: a weak trinket for the effort.", src: ['JNUB'] },
  524: { level: 'mild', why: 'The Fool?: weak for the effort.', src: ['JNUB'] },
  526: { level: 'mild', why: 'The High Priestess?: awkward and chaotic.', src: ['JNUB'] },
  534: { level: 'mild', why: 'Wheel of Fortune?: chaotic D4 effect.', src: ['JNUB'] },
  621: { level: 'mild', why: 'Soul of Judas clutters the rune pool.', src: ['JNUB'] },
  107: { level: 'mild', why: 'Guillotine makes you less accurate.', src: ['JNUB'] },
  456: { level: 'mild', why: 'Tinytoma: a quality 1 orbital.', src: ['JNUB'] },
  232: { level: 'mild', why: "Kidney Stone: Onan's Streak is an annoying challenge.", src: ['JNUB'] },
  628: { level: 'mild', why: 'Soul of the Lost: Tainted Lost is "an absolute nightmare".', src: ['JNUB'] },
  343: { level: 'mild', why: 'Flooded Caves makes some challenges more annoying; preferably after the challenges.', src: ['TINF'] },
};
