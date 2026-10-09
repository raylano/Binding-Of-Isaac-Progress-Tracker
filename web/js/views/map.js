// Progress map in minimap style: every room is an area or final boss, the
// corridors are the dependencies. White = done, dotted = reachable,
// dark = still locked.

import { store } from '../store.js';
import { CHARACTERS, MARK_INDEX, MARK_REQUIRES } from '../../data/characters.js';
import { achStatus, blockerChain, charUnlocked } from '../logic.js';
import { esc, glyph, statusBadge, bar } from '../ui.js';
import { chainHtml } from './characters.js';

const W = 150;
const H = 86;
const WIKI = 'https://bindingofisaacrebirth.wiki.gg/wiki/';

// x/y in grid positions. gate = achievement that opens the area, boss = mark key.
const NODES = [
  { key: 'basement', label: 'Basement', x: 0, y: 1, always: true, text: 'The start. Basement and Caves are always open.', wiki: 'Basement' },
  { key: 'caves', label: 'Caves', x: 1, y: 1, always: true, text: 'Main path, floors 3-4.', wiki: 'Caves' },
  { key: 'depths', label: 'Depths · Mom', x: 2, y: 1, always: true, text: 'Beating Mom opens The Womb (#4). Within 20 min on Depths II opens the door to Boss Rush.', wiki: 'Mom' },
  { key: 'bossrush', label: 'Boss Rush', x: 2, y: 0, boss: 'bossrush', text: 'Beat Mom within 20 minutes (Depths II) or 25 minutes (Mausoleum/Gehenna II).', wiki: 'Boss_Rush' },
  { key: 'womb', label: "Womb · Heart", x: 3, y: 1, gate: 4, boss: 'heart', text: "Mom's Heart (or It Lives! after 11 times, #34). 10 times = Blue Womb, 11 times = It Lives!.", wiki: 'Womb' },
  { key: 'bluewomb', label: 'Blue Womb · Hush', x: 3, y: 0, gate: 234, boss: 'hush', counter: ['hushKills', 3, 'Hush kills for A Secret Exit'], text: "After 10x Mom's Heart (#234). Beating Mom's Heart within 30 min opens the door. Hush 1x = The Void, 3x = A Secret Exit.", wiki: 'Blue_Womb' },
  { key: 'void', label: 'Void · Delirium', x: 4, y: 0, gate: 320, boss: 'delirium', text: 'Beating Hush opens The Void (#320). In Repentance+ the portal is guaranteed after Hush, ???, The Lamb and Mega Satan.', wiki: 'The_Void' },
  { key: 'cathedral', label: 'Cathedral', x: 4, y: 1, needs: [4], boss: 'isaac', text: "After Mom's Heart: beam of light to Cathedral. Beat Isaac 5x = The Polaroid (#57).", wiki: 'Cathedral' },
  { key: 'chest', label: 'The Chest · ???', x: 5, y: 1, gate: 57, boss: 'bluebaby', text: "Touch Isaac's chest while holding The Polaroid.", wiki: 'The_Chest' },
  { key: 'sheol', label: 'Sheol', x: 4, y: 2, needs: [4], boss: 'satan', text: "After Mom's Heart: trapdoor to Sheol. Beat Satan 5x = The Negative (#78).", wiki: 'Sheol' },
  { key: 'darkroom', label: 'Dark Room · Lamb', x: 5, y: 2, gate: 78, boss: 'lamb', text: "Touch Satan's chest while holding The Negative.", wiki: 'Dark_Room' },
  { key: 'megasatan', label: 'Mega Satan', x: 6, y: 1, gate: 155, boss: 'megasatan', text: 'Golden door in the starting room of The Chest or Dark Room. Open it with both key pieces from Angel Rooms (Angels, #155) or Dad\'s Key.', wiki: 'Mega_Satan' },
  { key: 'secretexit', label: 'Secret exit', x: 0, y: 3, gate: 407, counter: ['hushKills', 3, 'Hush kills'], text: 'A Secret Exit (#407): beat Hush 3x. After that every floor II has an extra exit to the alternate path.', wiki: 'Downpour' },
  { key: 'downpour', label: 'Downpour', x: 1, y: 3, gate: 407, doneAch: 412, text: 'Door with a key. On II: touch the white fire and go through the mirror for knife piece 1. All bosses here = Dross (#412).', wiki: 'Downpour' },
  { key: 'mines', label: 'Mines', x: 2, y: 3, gate: 407, doneAch: 413, text: 'Door costs 2 bombs. On II: press 3 yellow buttons and take the mine cart for knife piece 2. All bosses here = Ashpit (#413).', wiki: 'Mines' },
  { key: 'mausoleum', label: 'Mausoleum', x: 3, y: 3, gate: 407, doneAch: 414, text: 'Door costs 2 hearts. On II: Mom, then open the flesh door with the knife. All bosses here = Gehenna (#414).', wiki: 'Mausoleum' },
  { key: 'corpse', label: 'Corpse', x: 4, y: 3, gate: 407, doneAch: 411, text: 'Reachable with both knife pieces via Mausoleum/Gehenna II. First visit = Rotten Heart (#411).', wiki: 'Corpse' },
  { key: 'mother', label: 'Mother', x: 5, y: 3, gate: 407, boss: 'mother', text: 'Beating Mother: A Strange Door (#635) and Jacob & Esau (#405). The most important unlock in Repentance.', wiki: 'Mother' },
  { key: 'home', label: "Home · Dad's Note", x: 6, y: 3, gate: 635, doneAch: 415, text: "Strange Door in the starting room of Depths II, opened with The Polaroid or Negative (which is used up). The special Mausoleum II has no Mom: the boss room holds Dad's Note → Ascent → Home. Mom's Chest = Red Key (#415).", wiki: 'Home' },
  { key: 'beast', label: 'The Beast', x: 7, y: 3, gate: 635, boss: 'beast', text: 'After Home: Dogma and then The Beast.', wiki: 'The_Beast' },
  { key: 'closet', label: 'Tainted closet', x: 6, y: 4, gate: 635, tainted: true, text: 'In the hallway of Home: open the closet with the Red Key (guaranteed on the first visit), a Cracked Key or Soul of Cain. You get the tainted version of your current character. One per run.', wiki: 'Tainted_Characters' },
  { key: 'greed', label: 'Greed mode', x: 0, y: 5, always: true, boss: 'greed', text: 'Always open. After Ultra Greed you can donate coins to the Greed machine; they count across runs.', wiki: 'Greed_Mode' },
  { key: 'greedier', label: 'Greedier', x: 1, y: 5, gate: 341, counter: ['greedDonation', 500, 'coins in the Greed machine'], text: '500 coins donated (#341). Greedier counts as the hard Greed mark.', wiki: 'Greedier_Mode' },
  { key: 'keeper', label: 'Keeper', x: 2, y: 5, gate: 251, counter: ['greedDonation', 1000, 'coins in the Greed machine'], text: '1000 coins donated (#251). Along the way: 879 = Holy Mantle for The Lost (#250).', wiki: 'Keeper' },
];

const EDGES = [
  ['basement', 'caves'], ['caves', 'depths'], ['depths', 'bossrush'], ['depths', 'womb'], ['womb', 'bluewomb'],
  ['bluewomb', 'void'], ['womb', 'cathedral'], ['cathedral', 'chest'], ['womb', 'sheol', 'elbow'], ['sheol', 'darkroom'],
  ['chest', 'megasatan'], ['darkroom', 'megasatan', 'elbow'], ['basement', 'secretexit'], ['secretexit', 'downpour'],
  ['downpour', 'mines'], ['mines', 'mausoleum'], ['mausoleum', 'corpse'], ['corpse', 'mother'], ['mother', 'home'],
  ['home', 'beast'], ['home', 'closet'], ['greed', 'greedier'], ['greedier', 'keeper'],
];

let selected = 'mother';

function bossDoneBy(state, boss) {
  return CHARACTERS.filter((c) => state.marks[c.key][MARK_INDEX[boss]] >= 1);
}

function nodeStatus(model, state, n) {
  const doneByBoss = n.boss ? bossDoneBy(state, n.boss).length > 0 : false;
  const taintedDone = n.tainted ? CHARACTERS.some((c) => c.tainted && charUnlocked(state, c.key)) : false;
  const done = n.always && !n.boss ? true
    : n.doneAch ? state.achievements.has(n.doneAch)
      : n.boss ? doneByBoss
        : n.tainted ? taintedDone
          : n.gate ? state.achievements.has(n.gate) : false;
  if (done) return 'done';
  const needs = [...(n.needs || [])];
  if (n.boss) for (const r of MARK_REQUIRES[n.boss]) needs.push(r);
  if (n.gate && n.gate !== n.doneAch && (n.boss || n.doneAch || n.tainted)) needs.push(n.gate);
  const ok = needs.every((r) => (Array.isArray(r) ? r.some((id) => state.achievements.has(id)) : state.achievements.has(r)));
  if (!n.boss && !n.doneAch && !n.tainted && n.gate) {
    return achStatus(model, state, n.gate).status === 'locked' ? 'locked' : 'open';
  }
  return ok ? 'open' : 'locked';
}

const center = (n) => [n.x * W + W / 2, n.y * H + H / 2];

export function mount(root) {
  root.addEventListener('click', (e) => {
    const r = e.target.closest('[data-node]');
    if (r) { selected = r.dataset.node; update(root); }
  });
  root.addEventListener('keydown', (e) => {
    const r = e.target.closest('[data-node]');
    if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); selected = r.dataset.node; update(root); }
  });
  update(root);
}

export function unmount() {}

export function update(root) {
  const { model, state } = store;
  const byKey = Object.fromEntries(NODES.map((n) => [n.key, n]));
  const st = Object.fromEntries(NODES.map((n) => [n.key, nodeStatus(model, state, n)]));
  const cols = Math.max(...NODES.map((n) => n.x)) + 1;
  const rows = Math.max(...NODES.map((n) => n.y)) + 1;

  const edges = EDGES.map(([a, b, kind]) => {
    const [x1, y1] = center(byKey[a]);
    const [x2, y2] = center(byKey[b]);
    const lit = st[a] === 'done' && st[b] !== 'locked';
    const d = kind === 'elbow' && x1 !== x2 && y1 !== y2 ? `M${x1} ${y1}V${y2}H${x2}` : `M${x1} ${y1}L${x2} ${y2}`;
    return `<path class="edge ${lit ? 'lit' : ''}" d="${d}" fill="none"/>`;
  }).join('');

  const rooms = NODES.map((n) => {
    const [cx, cy] = center(n);
    const w = W - 26;
    const h = H - 26;
    const words = n.label.split(' · ');
    const icon = n.boss ? `<g class="ico" transform="translate(${cx - 13} ${cy - h / 2 + 4}) scale(.8)" color="${st[n.key] === 'done' ? '#1b120c' : st[n.key] === 'open' ? '#f1e6cc' : '#6f5c4b'}"><use href="#g-${n.boss}" width="32" height="32"/></g>` : '';
    const textY = n.boss ? cy + 12 : cy + 5;
    return `<g class="room ${st[n.key]} ${selected === n.key ? 'sel' : ''}" data-node="${n.key}" tabindex="0" role="button" aria-label="${esc(n.label)}: ${st[n.key]}">
      <rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="6"/>
      ${icon}
      <text x="${cx}" y="${textY}">${esc(words[words.length - 1])}</text>
    </g>`;
  }).join('');

  const n = byKey[selected];
  root.innerHTML = `
    <h1 class="view-title">Map</h1>
    <p class="view-sub">Every room is an area or final boss; the corridors show what opens what. Tap a room for its requirements.</p>
    <div class="map-wrap">
      <div>
        <div class="map-scroll">
          <svg class="map" viewBox="-6 -6 ${cols * W + 12} ${rows * H + 12}" role="img" aria-label="Progress map">
            ${edges}${rooms}
          </svg>
        </div>
        <div class="map-legend">
          <span><i style="background:#e8dcc0;border-color:#000"></i>done</span>
          <span><i style="background:#4b3a2c;border-color:#e8dcc0;border-style:dashed"></i>reachable</span>
          <span><i style="background:#1c140f;border-color:#3d2f24"></i>locked</span>
        </div>
      </div>
      <aside class="paper tape">${detail(model, state, n, st[n.key])}</aside>
    </div>`;
}

function detail(model, state, n, status) {
  const by = n.boss ? bossDoneBy(state, n.boss) : [];
  const counter = n.counter ? state.counters[n.counter[0]] : undefined;
  let chain = '';
  if (status === 'locked') {
    const gateId = n.gate || (n.boss && MARK_REQUIRES[n.boss].find((r) => !Array.isArray(r) && !state.achievements.has(r)));
    if (gateId && !state.achievements.has(gateId)) {
      const a = model.byId.get(gateId);
      chain = `<h4>Needed first</h4><ul class="chain-list"><li><b>${esc(a.name)}</b> — ${esc(a.how)}${chainHtml(model, blockerChain(model, state, gateId))}</li></ul>`;
    }
  }
  return `
    <div class="ink-label">${n.boss ? `${glyph(n.boss)}` : ''} room</div>
    <h3>${esc(n.label)}</h3>
    <p>${statusBadge(status)}</p>
    <p>${esc(n.text)}</p>
    ${n.counter ? `<h4>Counter</h4>${counter === undefined ? '<p class="muted">Unknown: import your save.</p>' : `${bar(Math.min(counter, n.counter[1]), n.counter[1], 'gold')}<p class="muted">${counter} / ${n.counter[1]} ${esc(n.counter[2])}</p>`}` : ''}
    ${chain}
    ${n.boss ? `<h4>Beaten by</h4><p>${by.length ? by.map((c) => `${esc(c.short || c.name)}${state.marks[c.key][MARK_INDEX[n.boss]] === 2 ? ' <b style="color:var(--blood)">(hard)</b>' : ''}`).join(', ') : '<span class="muted">nobody yet</span>'}</p>` : ''}
    ${n.tainted ? `<h4>Tainted unlocked</h4><p>${CHARACTERS.filter((c) => c.tainted && charUnlocked(state, c.key)).map((c) => esc(c.name)).join(', ') || '<span class="muted">none yet</span>'}</p>` : ''}
    <p class="src"><a href="${WIKI}${esc(n.wiki)}" target="_blank" rel="noopener">wiki: ${esc(n.wiki.replace(/_/g, ' '))}</a></p>`;
}
