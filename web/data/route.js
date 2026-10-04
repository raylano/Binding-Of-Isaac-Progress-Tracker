// Meta-route: wat de community-guides als volgorde aanraden, samengevoegd.
// Een stap is klaar als al zijn achievements binnen zijn. Hoe je iets haalt, komt
// altijd uit de wiki-data (achievements.json), niet uit deze tekst.

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
  { key: 'basis', name: 'Fundament', note: 'Sterke items en het werkpaard. Alles daarna gaat sneller.' },
  { key: 'void', name: 'Blue Womb & The Void', note: 'Hush opent The Void, en 3x Hush opent het alternatieve pad.' },
  { key: 'mother', name: 'Mother', note: 'De belangrijkste unlock van Repentance: de Strange Door naar Home.' },
  { key: 'tainted', name: 'Tainted', note: 'Kast in Home met de Red Key. Eén tainted per run.' },
  { key: 'greed', name: 'Greed-machine', note: 'Munten tellen over runs heen. Wissel van personage tegen vastlopen.' },
  { key: 'rest', name: 'Personages afmaken', note: 'Apollyon, The Forgotten en The Lost (na Holy Mantle).' },
  { key: 'eind', name: 'Eindspel', note: 'Hard mode-marks, Godhead en uiteindelijk Dead God.' },
];

export const ROUTE = [
  // Fase 1
  { key: 'azazel', phase: 'basis', title: 'Azazel als werkpaard', ach: [79],
    why: 'Vliegen + Brimstone-achtige aanval: met afstand het makkelijkste personage voor algemene unlocks.',
    src: ['JNUB', 'PIEL', 'TINF'] },
  { key: 'runes', phase: 'basis', title: 'De zes goede runen', ach: [90, 91, 94, 93, 96, 233],
    why: 'Zodra deze runen in de pool zitten, krijg je minder losse runescherven. Jera en Perthro zijn sterk.',
    src: ['JNUB', 'TINF'] },
  { key: 'lilith', phase: 'basis', title: 'Lilith via Azazel in Greed', ach: [199],
    why: 'Lilith opent Incubus en later C Section en Tainted Lilith; een makkelijke Greed-clear met Azazel.',
    src: ['JNUB', 'TINF'] },
  { key: 'endings', phase: 'basis', title: 'It Lives!, Polaroid en Negative', ach: [34, 57, 78],
    why: 'Zonder Polaroid/Negative geen Chest of Dark Room, dus geen ???, Lamb of Mega Satan.',
    src: ['PIEL', 'TINF'] },
  { key: 'chaos', phase: 'basis', title: 'Chaos Card (Demo Man)', ach: [97],
    why: 'Doodt de meeste bazen met één worp; maakt veel lastige gevechten triviaal.', src: ['JNUB', 'TINF'] },
  { key: 'devil', phase: 'basis', title: "Mom's Knife en Satanic Bible", ach: [43, 126],
    why: 'Twee van de sterkste Devil-deal-items.', src: ['JNUB'] },
  { key: 'shop', phase: 'basis', title: 'Donation-machine tot Stop Watch', ach: [151, 153, 154, 138],
    why: 'Grotere winkels; later kun je met bommen munten uit een volle machine halen.',
    src: ['PIEL', 'JNUB'] },
  { key: 'dailies', phase: 'basis', title: 'Broken Modem (7 dailies)', ach: [354],
    why: 'Begin vroeg met dailies; Broken Modem is een sterk active item.', src: ['JNUB', 'PIEL'] },

  // Fase 2
  { key: 'void', phase: 'void', title: 'The Void (Hush verslaan)', ach: [320],
    why: 'Nodig voor Delirium en alle Delirium-unlocks.', src: ['JNUB', 'PIEL'] },
  { key: 'incubus', phase: 'void', title: 'Incubus (Hush als Lilith)', ach: [190],
    why: 'Verdubbelt je tranen zonder nadeel. Doe Lilith als eerste Hush-personage.', src: ['JNUB', 'TINF'] },
  { key: 'athame', phase: 'void', title: 'Athame (Hush als Eve)', ach: [184],
    why: 'Sterk Devil-deal-item.', src: ['JNUB'] },
  { key: 'secretexit', phase: 'void', title: 'A Secret Exit (Hush 3x)', ach: [407],
    why: 'Opent Downpour, Mines en Mausoleum: de weg naar Mother.', src: ['JNUB', 'WIKI'] },
  { key: 'delirium', phase: 'void', title: 'Delirium: D infinity, Eden\'s Soul, Eucharist', ach: [338, 282, 289, 283],
    why: 'In Repentance+ is het Void-portaal gegarandeerd na Hush, ???, Lamb en Mega Satan.',
    src: ['JNUB', 'TINF'] },

  // Fase 3
  { key: 'bethany', phase: 'mother', title: 'Bethany (Lazarus, Hard, zonder doodgaan)', ach: [404],
    why: 'Bethany is ideaal voor Mother. Doe de run zonder Boss Rush: dat zou Missing No. ontgrendelen.',
    src: ['TINF'] },
  { key: 'mother', phase: 'mother', title: 'Mother verslaan: Strange Door + Jacob & Esau', ach: [635, 405],
    why: '"Single most important unlock": opent Home, The Beast en alle tainted personages.',
    src: ['JNUB', 'TINF'] },
  { key: 'm', phase: 'mother', title: "'M (Mother als Eden)", ach: [458],
    why: 'Beste trinket; de eerste Mother-unlock die de moeite waard is.', src: ['JNUB'] },
  { key: 'goodstuff', phase: 'mother', title: 'The D6, Curved Horn, Stairway, Birthright', ach: [29, 52, 429, 431],
    why: 'Sterke items die de pool flink verbeteren.', src: ['JNUB'] },

  // Fase 4
  { key: 't-lilith', phase: 'tainted', title: 'Tainted Lilith, C Section, Twisted Pair', ach: [485, 463, 502],
    why: 'Tainted Lilith is makkelijk; C Section is waarschijnlijk de beste traanvervanger.', src: ['JNUB', 'TINF'] },
  { key: 't-isaac', phase: 'tainted', title: 'Tainted Isaac, Options?, Glitched Crown, Spindown Dice', ach: [474, 441, 491, 584],
    why: 'Glitched Crown is "D6 op steroïden".', src: ['JNUB'] },
  { key: 't-lazarus', phase: 'tainted', title: 'Tainted Lazarus en Flip', ach: [482, 592],
    why: 'Flip is een veilige Damocles-variant.', src: ['JNUB'] },

  // Fase 5
  { key: 'greedier', phase: 'greed', title: 'Greedier! (500 munten)', ach: [341],
    why: 'Nieuwe modus, en de Greedier-marks tellen als de harde Greed-mark.', src: ['JNUB', 'PIEL'] },
  { key: 'mantle', phase: 'greed', title: 'Holy Mantle voor The Lost (879)', ach: [250],
    why: 'Speel The Lost pas als hij met Holy Mantle start.', src: ['JNUB', 'PIEL'] },
  { key: 'keeper', phase: 'greed', title: 'Keeper (1000 munten)', ach: [251],
    why: 'Laatste mijlpaal van de Greed-machine.', src: ['JNUB', 'PIEL'] },

  // Fase 6
  { key: 'apollyon', phase: 'rest', title: 'Apollyon (Mega Satan) en Void', ach: [340, 295],
    why: 'Void (Delirium als Apollyon) kan runs breken.', src: ['JNUB'] },
  { key: 'forgotten', phase: 'rest', title: 'The Forgotten (schep-quest)', ach: [390],
    why: 'Lange quest; let op de extra voorwaarden (The Lamb ooit verslagen, geen seed).', src: ['TINF', 'WIKI'] },
  { key: 'lost', phase: 'rest', title: 'The Lost', ach: [82],
    why: 'Ontgrendel hem gerust, maar speel zijn marks pas na Holy Mantle.', src: ['JNUB', 'PIEL'] },

  // Fase 7
  { key: 'godhead', phase: 'eind', title: 'Godhead (alle Hard-marks als The Lost)', ach: [156],
    why: 'Bewaar dit voor het eind: The Lost op Hard is het zwaarst.', src: ['JNUB', 'TINF'] },
  { key: 'deadgod', phase: 'eind', title: 'Dead God', ach: [637],
    why: 'Alles. Inclusief de 4 Repentance+-achievements.', src: ['WIKI'] },
];

// Unlocks die de guides willen uitstellen. 'hard' = echt slecht voor je itempool,
// 'mild' = niet erg, maar geen haast.
export const AVOID = {
  105: { level: 'hard', why: 'Missing No. herschikt je items elke verdieping; "worst item in the game".', src: ['JNUB', 'PIEL', 'TINF'] },
  565: { level: 'hard', why: 'Torn Card is een schadelijke trinket.', src: ['JNUB'] },
  30: { level: 'hard', why: 'The Scissors: "insufferably bad". Komt vanzelf bij 100 doden.', src: ['JNUB'] },
  500: { level: 'hard', why: 'TMTRAINER: glitch-items, volledig onvoorspelbaar.', src: ['JNUB'] },
  593: { level: 'hard', why: 'Corrupted Data: glitch-items in je pool.', src: ['JNUB', 'PIEL'] },
  588: { level: 'hard', why: 'IBS blokkeert nuttige items.', src: ['JNUB'] },
  51: { level: 'hard', why: 'Abel is berucht slecht.', src: ['JNUB'] },
  116: { level: 'hard', why: "Lazarus' Rags verpest je Angel Room-pool.", src: ['TINF'] },
  614: { level: 'mild', why: 'Rotten Beggar: slechtste bedelaarstype.', src: ['JNUB'] },
  472: { level: 'mild', why: 'Magic Skin werkt alleen goed met Confessionals.', src: ['JNUB'] },
  240: { level: 'mild', why: 'Sticky Nickels zijn een verslechtering van gewone munten.', src: ['JNUB'] },
  285: { level: 'mild', why: 'Shade vervangt Devil-deal-items.', src: ['JNUB'] },
  70: { level: 'mild', why: "Isaac's Head is een matige trinket.", src: ['JNUB'] },
  99: { level: 'mild', why: 'Rules Card vervuilt de kaartenpool.', src: ['JNUB'] },
  133: { level: 'mild', why: 'The D100 is te chaotisch.', src: ['JNUB'] },
  114: { level: 'mild', why: "???'s Only Friend is een zwakke familiar.", src: ['JNUB'] },
  580: { level: 'mild', why: 'RC Remote is een nutteloze trinket.', src: ['JNUB'] },
  594: { level: 'mild', why: 'Ghost Bombs: matig voor de moeite.', src: ['JNUB'] },
  568: { level: 'mild', why: "Kid's Drawing: zwakke trinket voor de moeite.", src: ['JNUB'] },
  524: { level: 'mild', why: 'The Fool?: zwak voor de moeite.', src: ['JNUB'] },
  526: { level: 'mild', why: 'The High Priestess?: lastig en chaotisch.', src: ['JNUB'] },
  534: { level: 'mild', why: 'Wheel of Fortune?: chaotisch D4-effect.', src: ['JNUB'] },
  621: { level: 'mild', why: 'Soul of Judas vervuilt de runenpool.', src: ['JNUB'] },
  107: { level: 'mild', why: 'Guillotine maakt je minder nauwkeurig.', src: ['JNUB'] },
  456: { level: 'mild', why: 'Tinytoma: kwaliteit 1-orbital.', src: ['JNUB'] },
  232: { level: 'mild', why: "Kidney Stone: Onan's Streak is een vervelende challenge.", src: ['JNUB'] },
  628: { level: 'mild', why: 'Soul of the Lost: Tainted Lost is "an absolute nightmare".', src: ['JNUB'] },
  343: { level: 'mild', why: 'Flooded Caves maakt sommige challenges vervelender; liefst na de challenges.', src: ['TINF'] },
};
