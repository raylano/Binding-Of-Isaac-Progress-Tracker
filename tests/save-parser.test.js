import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseSave, decodeMark, MARK_COUNTERS, COUNTERS, SaveError } from '../web/js/save-parser.js';
import { CHARACTERS, MARK_INDEX } from '../web/data/characters.js';

// Builds a minimal, valid save: header, 10 sections, achievements + counters.
function fakeSave({ achievements = [], counters = {} } = {}) {
  const sizes = [1, 4, 4, 1, 1, 1, 1, 4, 4, 1];
  const counts = [642, 523, 14, 733, 7, 104, 46, 27, 2, 80];
  let total = 0x14;
  sizes.forEach((s, i) => { total += 12 + s * counts[i]; });
  const buf = new Uint8Array(total + 4);
  const dv = new DataView(buf.buffer);
  buf.set([...'ISAACNGSAVE09R  '].map((c) => c.charCodeAt(0)), 0);
  buf[0x18] = 0x82;
  let ofs = 0x14;
  sizes.forEach((s, i) => {
    dv.setUint32(ofs, i + 1, true);
    dv.setUint32(ofs + 4, s * counts[i], true);
    dv.setUint32(ofs + 8, counts[i], true);
    ofs += 12;
    if (i === 0) for (const id of achievements) buf[ofs + id] = 1;
    if (i === 1) for (const [idx, v] of Object.entries(counters)) dv.setUint32(ofs + Number(idx) * 4, v, true);
    ofs += s * counts[i];
  });
  return buf;
}

test('mark-byte: 1 normal, 2 en 3 hard, online in bits 2-3', () => {
  assert.deepEqual(decodeMark(0), { solo: 0, online: 0 });
  assert.deepEqual(decodeMark(1), { solo: 1, online: 0 });
  assert.deepEqual(decodeMark(3), { solo: 2, online: 0 });
  assert.deepEqual(decodeMark(4), { solo: 0, online: 1 });
  assert.deepEqual(decodeMark(9), { solo: 1, online: 2 });
});

test('mark-tabel: 12 x 34 unieke counters', () => {
  const all = MARK_COUNTERS.flat();
  assert.equal(all.length, 12 * 34);
  assert.equal(new Set(all).size, all.length);
});

test('synthetische save: achievements, marks en tellers', () => {
  const lazarus = CHARACTERS.find((c) => c.key === 'lazarus').index;
  const tLilith = CHARACTERS.find((c) => c.key === 't-lilith').index;
  const counters = {
    [MARK_COUNTERS[MARK_INDEX.hush][lazarus]]: 3,
    [MARK_COUNTERS[MARK_INDEX.beast][tLilith]]: 1,
    [COUNTERS.greedDonation]: 59,
    [COUNTERS.hushKills]: 3,
  };
  const s = parseSave(fakeSave({ achievements: [1, 80, 407, 641], counters }));
  assert.equal(s.edition, 'Repentance+');
  assert.deepEqual(s.achievements, [1, 80, 407, 641]);
  assert.equal(s.marks[lazarus][MARK_INDEX.hush], 2);
  assert.equal(s.marks[lazarus][MARK_INDEX.greed], 0);
  assert.equal(s.marks[tLilith][MARK_INDEX.beast], 1);
  assert.equal(s.counters.greedDonation, 59);
  assert.equal(s.counters.hushKills, 3);
});

test('geen save: nette fout', () => {
  assert.throws(() => parseSave(new Uint8Array(200)), SaveError);
  assert.throws(() => parseSave(new Uint8Array(10)), SaveError);
  const cut = fakeSave().subarray(0, 300);
  assert.throws(() => parseSave(cut), SaveError);
});

// Optional: the real save (never goes into the repo). ISAAC_SAVE=path npm test
const real = process.env.ISAAC_SAVE;
test('echte save', { skip: !real || !fs.existsSync(real) }, () => {
  const s = parseSave(fs.readFileSync(real));
  assert.equal(s.achievementSlots, 641);
  assert.ok(s.achievements.length > 0);
  const isaac = s.marks[0];
  // From the user's summary: Isaac has, among others, Mom's Heart, Satan and Hush.
  for (const mk of ['heart', 'satan', 'hush']) assert.ok(isaac[MARK_INDEX[mk]] >= 1, mk);
});
