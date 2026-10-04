// Leest een Repentance(+)-save (rep+persistentgamedata1.dat / rep_persistentgamedata1.dat).
// Puur en zonder afhankelijkheden: draait in de browser en in Node.
//
// Formaat (little-endian, niet versleuteld):
//   0x00  "ISAACNGSAVE09R  " (16 bytes)
//   0x14  secties, elk: type (u32), lengte (u32), aantal (u32), daarna aantal x entrygrootte
//   sectie 1: achievements, 1 byte per ID (index 0 ongebruikt)
//   sectie 2: event counters, 4 bytes per stuk -- hier staan ook de completion marks
//   laatste 4 bytes: checksum (hier niet nodig, we schrijven nooit)
//
// Counter-indexen komen uit REPENTOGON's EventCounter-lijst; de mark-offsets zijn
// daarnaast nagerekend met de offsets uit jamesthejellyfish/isaac-save-edit-script (MIT).
// Beide bronnen geven voor alle 34 x 12 marks hetzelfde resultaat.

const HEADER = 'ISAACNGSAVE09R';
const ENTRY_SIZES = [1, 4, 4, 1, 1, 1, 1, 4, 4, 1];

export const VERSIONS = { 0x7e: 'Repentance', 0x82: 'Repentance+' };

// Counter-index per mark (save-volgorde van MARKS) per personage (save-volgorde).
// Voor de eerste 14 personages loopt het netjes op; The Forgotten en alles daarna
// is later toegevoegd en zit verspreid.
function row(first14, forgotten, rest) {
  const out = [];
  for (let i = 0; i < 14; i++) out.push(first14 + i);
  out.push(forgotten);
  for (let i = 0; i < 19; i++) out.push(rest + i);
  return out;
}

export const MARK_COUNTERS = [
  row(27, 203, 214), // Mom's Heart
  row(41, 204, 233), // Isaac
  row(55, 205, 252), // Satan
  row(69, 206, 271), // Boss Rush
  row(83, 207, 290), // ???
  row(97, 208, 309), // The Lamb
  row(116, 209, 328), // Mega Satan
  row(130, 210, 347), // Ultra Greed
  row(144, 211, 366), // Hush
  row(173, 213, 404), // Delirium
  Array.from({ length: 34 }, (_, i) => 423 + i), // Mother
  Array.from({ length: 34 }, (_, i) => 457 + i), // The Beast
];

export const COUNTERS = {
  momKills: 1,
  rocks: 2,
  tintedRocks: 3,
  poop: 5,
  pills: 6,
  deathCards: 7,
  arcades: 9,
  deaths: 10,
  isaacKills: 11,
  shopkeepers: 12,
  satanKills: 13,
  shellGames: 14,
  angelDeals: 15,
  devilDeals: 16,
  bloodDonations: 17,
  slotsBroken: 18,
  donation: 20,
  edenTokens: 21,
  streak: 22,
  bestStreak: 23,
  blueBabyKills: 24,
  lambKills: 25,
  megaSatanKills: 26,
  bossRushes: 111,
  greedDonation: 115,
  hushKills: 158,
  deliriumKills: 187,
  dailiesPlayed: 190,
  dailyStreak: 192,
  dailiesWon: 193,
  batteries: 195,
  cardsUsed: 196,
  shopItems: 197,
  secretWalls: 199,
  bloodClots: 200,
  rubberCement: 201,
  motherKills: 491,
  beastKills: 492,
  babyPlumKills: 493,
  batteryBumPayouts: 495,
};

export class SaveError extends Error {}

// Een mark-byte: bits 0-1 offline, bits 2-3 online (Repentance+). Binnen een paar
// betekent 1 normal, 2 hard en 3 beide; hard telt altijd ook als normal.
export function decodeMark(v) {
  const level = (bits) => (bits & 2 ? 2 : bits & 1 ? 1 : 0);
  return { solo: level(v & 3), online: level((v >> 2) & 3) };
}

export function parseSave(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 0x40) throw new SaveError('Dit bestand is te klein voor een Isaac-save.');
  const head = String.fromCharCode(...bytes.subarray(0, HEADER.length));
  if (head !== HEADER) throw new SaveError('Dit is geen Isaac-save (verkeerde header).');

  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = bytes[0x18];

  const sections = [];
  let ofs = 0x14;
  for (const size of ENTRY_SIZES) {
    if (ofs + 12 > bytes.length) throw new SaveError('Save is afgekapt of onbekend formaat.');
    const count = dv.getUint32(ofs + 8, true);
    ofs += 12;
    sections.push({ start: ofs, count });
    ofs += count * size;
    if (ofs > bytes.length) throw new SaveError('Save is afgekapt of onbekend formaat.');
  }

  const [ach, ctr] = sections;
  const achievements = [];
  for (let id = 1; id < ach.count; id++) if (bytes[ach.start + id]) achievements.push(id);

  const counter = (i) => (i < ctr.count ? dv.getUint32(ctr.start + i * 4, true) : 0);

  const marks = [];
  const online = [];
  for (let c = 0; c < 34; c++) {
    const solo = [];
    const onl = [];
    for (let m = 0; m < MARK_COUNTERS.length; m++) {
      const d = decodeMark(counter(MARK_COUNTERS[m][c]));
      solo.push(d.solo);
      onl.push(d.online);
    }
    marks.push(solo);
    online.push(onl);
  }

  const counters = {};
  for (const [name, i] of Object.entries(COUNTERS)) counters[name] = counter(i);

  return {
    version,
    edition: VERSIONS[version] || `onbekend (0x${version.toString(16)})`,
    achievementSlots: ach.count - 1,
    achievements,
    marks,
    online,
    counters,
  };
}
