// Voortgangskaart in minimap-stijl: elke kamer is een gebied of eindbaas, de
// gangen zijn de afhankelijkheden. Wit = gehaald, gestippeld = bereikbaar,
// donker = nog op slot.

import { store } from '../store.js';
import { CHARACTERS, MARK_INDEX, MARK_REQUIRES } from '../../data/characters.js';
import { achStatus, blockerChain, charUnlocked } from '../logic.js';
import { esc, glyph, statusBadge, bar } from '../ui.js';
import { chainHtml } from './characters.js';

const W = 150;
const H = 86;
const WIKI = 'https://bindingofisaacrebirth.wiki.gg/wiki/';

// x/y in rasterposities. gate = achievement dat het gebied opent, boss = mark-sleutel.
const NODES = [
  { key: 'basement', label: 'Basement', x: 0, y: 1, always: true, text: 'Het begin. Basement en Caves zijn altijd open.', wiki: 'Basement' },
  { key: 'caves', label: 'Caves', x: 1, y: 1, always: true, text: 'Hoofdpad, verdieping 3-4.', wiki: 'Caves' },
  { key: 'depths', label: 'Depths · Mom', x: 2, y: 1, always: true, text: 'Mom verslaan opent The Womb (#4). Binnen 20 min op Depths II opent de deur naar Boss Rush.', wiki: 'Mom' },
  { key: 'bossrush', label: 'Boss Rush', x: 2, y: 0, boss: 'bossrush', text: 'Mom verslaan binnen 20 minuten (Depths II) of 25 minuten (Mausoleum/Gehenna II).', wiki: 'Boss_Rush' },
  { key: 'womb', label: "Womb · Heart", x: 3, y: 1, gate: 4, boss: 'heart', text: "Mom's Heart (of It Lives! na 11 keer, #34). 10 keer = Blue Womb, 11 keer = It Lives!.", wiki: 'Womb' },
  { key: 'bluewomb', label: 'Blue Womb · Hush', x: 3, y: 0, gate: 234, boss: 'hush', counter: ['hushKills', 3, 'Hush-kills voor A Secret Exit'], text: "Na 10x Mom's Heart (#234). Mom's Heart binnen 30 min verslaan opent de deur. Hush 1x = The Void, 3x = A Secret Exit.", wiki: 'Blue_Womb' },
  { key: 'void', label: 'Void · Delirium', x: 4, y: 0, gate: 320, boss: 'delirium', text: 'Hush verslaan opent The Void (#320). In Repentance+ is het portaal gegarandeerd na Hush, ???, The Lamb en Mega Satan.', wiki: 'The_Void' },
  { key: 'cathedral', label: 'Cathedral', x: 4, y: 1, needs: [4], boss: 'isaac', text: "Na Mom's Heart: lichtstraal naar Cathedral. Isaac 5x verslaan = The Polaroid (#57).", wiki: 'Cathedral' },
  { key: 'chest', label: 'The Chest · ???', x: 5, y: 1, gate: 57, boss: 'bluebaby', text: "Raak Isaac's kist aan met The Polaroid in je bezit.", wiki: 'The_Chest' },
  { key: 'sheol', label: 'Sheol', x: 4, y: 2, needs: [4], boss: 'satan', text: "Na Mom's Heart: luik naar Sheol. Satan 5x verslaan = The Negative (#78).", wiki: 'Sheol' },
  { key: 'darkroom', label: 'Dark Room · Lamb', x: 5, y: 2, gate: 78, boss: 'lamb', text: "Raak Satan's kist aan met The Negative in je bezit.", wiki: 'Dark_Room' },
  { key: 'megasatan', label: 'Mega Satan', x: 6, y: 1, gate: 155, boss: 'megasatan', text: 'Gouden deur in de startkamer van The Chest of Dark Room. Open met beide sleutelstukken uit Angel Rooms (Angels, #155) of Dad\'s Key.', wiki: 'Mega_Satan' },
  { key: 'secretexit', label: 'Geheime uitgang', x: 0, y: 3, gate: 407, counter: ['hushKills', 3, 'Hush-kills'], text: 'A Secret Exit (#407): Hush 3x verslaan. Daarna zit er op elke verdieping II een extra uitgang naar het alternatieve pad.', wiki: 'Downpour' },
  { key: 'downpour', label: 'Downpour', x: 1, y: 3, gate: 407, doneAch: 412, text: 'Deur met een sleutel. Op II: raak de witte vlam aan en ga door de spiegel voor mesdeel 1. Alle bazen hier = Dross (#412).', wiki: 'Downpour' },
  { key: 'mines', label: 'Mines', x: 2, y: 3, gate: 407, doneAch: 413, text: 'Deur kost 2 bommen. Op II: druk 3 gele knoppen in en neem de mijnkar voor mesdeel 2. Alle bazen hier = Ashpit (#413).', wiki: 'Mines' },
  { key: 'mausoleum', label: 'Mausoleum', x: 3, y: 3, gate: 407, doneAch: 414, text: 'Deur kost 2 hartjes. Op II: Mom, dan de vleesdeur openen met het mes. Alle bazen hier = Gehenna (#414).', wiki: 'Mausoleum' },
  { key: 'corpse', label: 'Corpse', x: 4, y: 3, gate: 407, doneAch: 411, text: 'Bereikbaar met beide mesdelen via Mausoleum/Gehenna II. Eerste keer binnen = Rotten Heart (#411).', wiki: 'Corpse' },
  { key: 'mother', label: 'Mother', x: 5, y: 3, gate: 407, boss: 'mother', text: 'Mother verslaan: A Strange Door (#635) en Jacob & Esau (#405). De belangrijkste unlock van Repentance.', wiki: 'Mother' },
  { key: 'home', label: "Home · Dad's Note", x: 6, y: 3, gate: 635, doneAch: 415, text: "Strange Door in de startkamer van Depths II, opent met The Polaroid of Negative (die wordt opgebruikt). De speciale Mausoleum II heeft geen Mom: de bossroom bevat Dad's Note → Ascent → Home. Mom's Chest = Red Key (#415).", wiki: 'Home' },
  { key: 'beast', label: 'The Beast', x: 7, y: 3, gate: 635, boss: 'beast', text: 'Na Home: Dogma en daarna The Beast.', wiki: 'The_Beast' },
  { key: 'closet', label: 'Tainted-kast', x: 6, y: 4, gate: 635, tainted: true, text: 'In de gang van Home: open de kast met de Red Key (eerste bezoek gegarandeerd), een Cracked Key of Soul of Cain. Je krijgt de tainted versie van je huidige personage. Eén per run.', wiki: 'Tainted_Characters' },
  { key: 'greed', label: 'Greed mode', x: 0, y: 5, always: true, boss: 'greed', text: 'Altijd open. Na Ultra Greed kun je munten doneren aan de Greed-machine; die tellen over runs heen.', wiki: 'Greed_Mode' },
  { key: 'greedier', label: 'Greedier', x: 1, y: 5, gate: 341, counter: ['greedDonation', 500, 'munten in de Greed-machine'], text: '500 munten gedoneerd (#341). Greedier telt als de harde Greed-mark.', wiki: 'Greedier_Mode' },
  { key: 'keeper', label: 'Keeper', x: 2, y: 5, gate: 251, counter: ['greedDonation', 1000, 'munten in de Greed-machine'], text: '1000 munten gedoneerd (#251). Onderweg: 879 = Holy Mantle voor The Lost (#250).', wiki: 'Keeper' },
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
    <h1 class="view-title">Kaart</h1>
    <p class="view-sub">Elke kamer is een gebied of eindbaas; de gangen tonen wat wat opent. Tik een kamer voor de voorwaarden.</p>
    <div class="map-wrap">
      <div>
        <div class="map-scroll">
          <svg class="map" viewBox="-6 -6 ${cols * W + 12} ${rows * H + 12}" role="img" aria-label="Voortgangskaart">
            ${edges}${rooms}
          </svg>
        </div>
        <div class="map-legend">
          <span><i style="background:#e8dcc0;border-color:#000"></i>gehaald</span>
          <span><i style="background:#4b3a2c;border-color:#e8dcc0;border-style:dashed"></i>bereikbaar</span>
          <span><i style="background:#1c140f;border-color:#3d2f24"></i>op slot</span>
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
      chain = `<h4>Eerst nodig</h4><ul class="chain-list"><li><b>${esc(a.name)}</b> — ${esc(a.how)}${chainHtml(model, blockerChain(model, state, gateId))}</li></ul>`;
    }
  }
  return `
    <div class="ink-label">${n.boss ? `${glyph(n.boss)}` : ''} kamer</div>
    <h3>${esc(n.label)}</h3>
    <p>${statusBadge(status)}</p>
    <p>${esc(n.text)}</p>
    ${n.counter ? `<h4>Teller</h4>${counter === undefined ? '<p class="muted">Onbekend: importeer je save.</p>' : `${bar(Math.min(counter, n.counter[1]), n.counter[1], 'gold')}<p class="muted">${counter} / ${n.counter[1]} ${esc(n.counter[2])}</p>`}` : ''}
    ${chain}
    ${n.boss ? `<h4>Verslagen door</h4><p>${by.length ? by.map((c) => `${esc(c.short || c.name)}${state.marks[c.key][MARK_INDEX[n.boss]] === 2 ? ' <b style="color:var(--blood)">(hard)</b>' : ''}`).join(', ') : '<span class="muted">nog niemand</span>'}</p>` : ''}
    ${n.tainted ? `<h4>Tainted ontgrendeld</h4><p>${CHARACTERS.filter((c) => c.tainted && charUnlocked(state, c.key)).map((c) => esc(c.name)).join(', ') || '<span class="muted">nog geen</span>'}</p>` : ''}
    <p class="src"><a href="${WIKI}${esc(n.wiki)}" target="_blank" rel="noopener">wiki: ${esc(n.wiki.replace(/_/g, ' '))}</a></p>`;
}
