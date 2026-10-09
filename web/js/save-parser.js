// Reads a Repentance(+) save (rep+persistentgamedata1.dat / rep_persistentgamedata1.dat).
// Pure and dependency-free: runs in the browser and in Node.
//
// Format (little-endian, not encrypted):
//   0x00  "ISAACNGSAVE09R  " (16 bytes)
//   0x14  sections, each: type (u32), length (u32), count (u32), then count x entry size
//   section 1: achievements, 1 byte per ID (index 0 unused)
//   section 2: event counters, 4 bytes each -- the completion marks live here too
//   last 4 bytes: checksum (not needed here, we never write)
//
// Counter indexes come from REPENTOGON's EventCounter list; the mark offsets were
// also cross-checked against the offsets from jamesthejellyfish/isaac-save-edit-script (MIT).
// Both sources give the same result for all 34 x 12 marks.

const HEADER = 'ISAACNGSAVE09R';
const ENTRY_SIZES = [1, 4, 4, 1, 1, 1, 1, 4, 4, 1];

export const VERSIONS = { 0x7e: 'Repentance', 0x82: 'Repentance+' };

// Counter index per mark (save order of MARKS) per character (save order).
// For the first 14 characters it increases neatly; The Forgotten and everything
// after was added later and is scattered.
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

// A mark byte: bits 0-1 offline, bits 2-3 online (Repentance+). Within a pair,
// 1 means normal, 2 hard and 3 both; hard always counts as normal too.
export function decodeMark(v) {
  const level = (bits) => (bits & 2 ? 2 : bits & 1 ? 1 : 0);
  return { solo: level(v & 3), online: level((v >> 2) & 3) };
}

export function parseSave(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 0x40) throw new SaveError('This file is too small to be an Isaac save.');
  const head = String.fromCharCode(...bytes.subarray(0, HEADER.length));
  if (head !== HEADER) throw new SaveError('This is not an Isaac save (wrong header).');

  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = bytes[0x18];

  const sections = [];
  let ofs = 0x14;
  for (const size of ENTRY_SIZES) {
    if (ofs + 12 > bytes.length) throw new SaveError('Save is truncated or in an unknown format.');
    const count = dv.getUint32(ofs + 8, true);
    ofs += 12;
    sections.push({ start: ofs, count });
    ofs += count * size;
    if (ofs > bytes.length) throw new SaveError('Save is truncated or in an unknown format.');
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
    edition: VERSIONS[version] || `unknown (0x${version.toString(16)})`,
    achievementSlots: ach.count - 1,
    achievements,
    marks,
    online,
    counters,
  };
}
