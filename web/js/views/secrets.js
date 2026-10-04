import { store, mutate } from '../store.js';
import { CHARACTERS, CHAR_BY_KEY } from '../../data/characters.js';
import { AVOID, SOURCES } from '../../data/route.js';
import { achStatus, blockerChain, setAchievement, describeReq, howOf, GATES } from '../logic.js';
import { esc, achIcon, statusBadge, bar, openDrawer, drawerOpen, unlockedToasts, markName } from '../ui.js';
import { chainHtml } from './characters.js';

const PAGE = 80;
let q = '';
let status = 'alle';
let cat = 'alle';
let who = '';
let limit = PAGE;
let openId = null;

const CATS = [
  ['alle', 'Alle soorten'],
  ['char', 'Personages'],
  ['mark', 'Completion-beloningen'],
  ['challenge', 'Challenges'],
  ['counter', 'Tellers'],
  ['avoid', 'Liever uitstellen'],
  ['other', 'Overig'],
];

function category(model, a) {
  if (model.charOfUnlock.has(a.id)) return 'char';
  if (model.markOf.has(a.id)) return 'mark';
  if (/challenge #/i.test(a.how)) return 'challenge';
  if (model.counterRule.has(a.id)) return 'counter';
  return 'other';
}

function matches(model, state, a, st) {
  if (status !== 'alle' && st.status !== status) return false;
  if (cat === 'avoid') { if (!AVOID[a.id]) return false; } else if (cat !== 'alle' && category(model, a) !== cat) return false;
  if (who) {
    const m = model.markOf.get(a.id);
    const isChar = model.charOfUnlock.get(a.id) === who;
    if (!(m?.char === who || isChar || st.missing.some((r) => r.char === who))) return false;
  }
  if (q) {
    const hay = `${a.id} ${a.name} ${a.unlock} ${a.how}`.toLowerCase();
    if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  return true;
}

export function mount(root) {
  root.innerHTML = `
    <h1 class="view-title">Geheimen</h1>
    <p class="view-sub" id="sec-sub"></p>
    <div class="filters">
      <input class="search" type="search" id="sec-q" placeholder="Zoek op naam, item of eis…" value="${esc(q)}" aria-label="Zoeken">
      <div class="seg" role="group" aria-label="Status">
        ${[['alle', 'Alles'], ['done', 'Binnen'], ['open', 'Beschikbaar'], ['locked', 'Op slot']].map(([k, l]) => `<button type="button" data-status="${k}" aria-pressed="${status === k}">${l}</button>`).join('')}
      </div>
      <select class="search" id="sec-cat" aria-label="Soort">${CATS.map(([k, l]) => `<option value="${k}" ${cat === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <select class="search" id="sec-who" aria-label="Personage"><option value="">Alle personages</option>${CHARACTERS.map((c) => `<option value="${c.key}" ${who === c.key ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
    </div>
    <div class="ach-list" id="sec-list"></div>
    <div class="list-more" id="sec-more"></div>`;

  const qi = root.querySelector('#sec-q');
  let t;
  qi.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { q = qi.value.trim().toLowerCase(); limit = PAGE; update(root); }, 150); });
  root.querySelector('#sec-cat').addEventListener('change', (e) => { cat = e.target.value; limit = PAGE; update(root); });
  root.querySelector('#sec-who').addEventListener('change', (e) => { who = e.target.value; limit = PAGE; update(root); });
  root.addEventListener('click', (e) => {
    const s = e.target.closest('[data-status]');
    if (s) {
      status = s.dataset.status;
      limit = PAGE;
      root.querySelectorAll('[data-status]').forEach((b) => b.setAttribute('aria-pressed', b === s));
      return update(root);
    }
    if (e.target.closest('[data-more]')) { limit += PAGE * 2; return update(root); }
    if (e.target.matches('.tick')) return;
    const row = e.target.closest('[data-row]');
    if (row) openAchievement(Number(row.dataset.row));
  });
  root.addEventListener('change', (e) => {
    if (!e.target.matches('.tick')) return;
    toggle(Number(e.target.dataset.id), e.target.checked);
  });
  update(root);
}

export function unmount() {}

function toggle(id, on) {
  const { model } = store;
  const changed = mutate((s) => setAchievement(model, s, id, on));
  if (changed && on) unlockedToasts(model, [id]);
}

export function update(root) {
  const { model, state } = store;
  const list = root.querySelector('#sec-list');
  if (!list) return;
  const rows = [];
  let count = 0;
  for (const a of model.achievements) {
    const st = achStatus(model, state, a.id);
    if (!matches(model, state, a, st)) continue;
    count++;
    if (rows.length < limit) rows.push(row(model, state, a, st));
  }
  root.querySelector('#sec-sub').textContent = `${state.achievements.size} van ${model.achievements.length} binnen · ${count} getoond met deze filters. Vink af wat je haalt; tik een rij voor de uitleg.`;
  list.innerHTML = rows.join('') || '<div class="empty">Niets gevonden in deze hoek van de kelder.</div>';
  root.querySelector('#sec-more').innerHTML = count > limit ? `<button type="button" class="btn ghost" data-more>Toon meer (${count - limit})</button>` : '';
}

function row(model, state, a, st) {
  const avoid = AVOID[a.id];
  const blk = st.status === 'locked'
    ? `<div class="blk">Eerst: ${st.missing.slice(0, 4).map((r) => `<b>${esc(describeReq(model, r))}</b>`).join(', ')}${st.missing.length > 4 ? ` +${st.missing.length - 4}` : ''}</div>` : '';
  const prog = st.progress && st.status !== 'done' && st.progress.have !== null
    ? `<div class="prog">${bar(st.progress.have, st.progress.need, 'gold')}<span>${st.progress.have}/${st.progress.need}</span></div>` : '';
  const manual = state.manual.has(a.id) ? ' <span class="badge mild" title="Met de hand afgevinkt, niet uit je save">hand</span>' : '';
  return `
    <article class="paper ach" data-row="${a.id}">
      ${achIcon(model, a.id, st.status === 'done' ? '' : st.status)}
      <div>
        <div class="t"><b>${esc(a.name)}</b><span class="id">#${a.id}</span>${statusBadge(st.status)}${avoid ? `<span class="badge ${avoid.level === 'hard' ? 'avoid' : 'mild'}" title="${esc(avoid.why)}">uitstellen</span>` : ''}${manual}</div>
        <div class="u">${esc(a.unlock)}</div>
        <div class="h">${esc(howOf(model, a.id))}</div>
        ${blk}${prog}
      </div>
      <input type="checkbox" class="tick" data-id="${a.id}" ${st.status === 'done' ? 'checked' : ''} aria-label="${esc(a.name)} afvinken">
    </article>`;
}

export function openAchievement(id) {
  openId = id;
  renderDrawer(true);
}

export function refresh() {
  if (openId && drawerOpen() && document.querySelector('.drawer[data-achdrawer]')) renderDrawer(false);
}

function renderDrawer(fresh) {
  const { model, state } = store;
  const a = model.byId.get(openId);
  if (!a) return;
  const st = achStatus(model, state, a.id);
  const avoid = AVOID[a.id];
  const mark = model.markOf.get(a.id);
  const gate = GATES[a.id];
  const chain = st.status === 'locked' ? chainHtml(model, blockerChain(model, state, a.id)) : '';
  const wiki = a.page ? `https://bindingofisaacrebirth.wiki.gg/wiki/${encodeURIComponent(a.page.replace(/ /g, '_'))}` : SOURCES.WIKI.url;
  const html = `
    <section class="paper tape">
      <div class="note-head">${achIcon(model, a.id, st.status === 'done' ? '' : st.status)}<div><div class="n" style="font-size:24px">${esc(a.name)}</div><div class="c">#${a.id} · ${statusBadge(st.status)}</div></div></div>
      <p class="muted"><i>${esc(a.unlock)}</i></p>
      <h4>Hoe</h4>
      <p>${esc(howOf(model, a.id))}</p>
      ${a.note ? `<p class="muted">${esc(a.note)}</p>` : ''}
      ${mark ? `<p class="muted">Hoort bij de mark${mark.marks.length > 1 ? 's' : ''} ${mark.marks.length === 12 ? 'alle 12' : mark.marks.map(markName).join(' + ')} van ${esc(CHAR_BY_KEY[mark.char].name)}${mark.level === 2 ? ' (op Hard)' : ''}.</p>` : ''}
      ${st.progress ? `<h4>Teller</h4>${st.progress.have === null ? '<p class="muted">Onbekend: importeer je save.</p>' : `${bar(st.progress.have, st.progress.need, 'gold')}<p class="muted">${st.progress.have} / ${st.progress.need} ${esc(st.progress.label)}</p>`}` : ''}
      ${chain ? `<h4>Eerst nodig</h4>${chain}` : ''}
      ${avoid ? `<h4>Meta</h4><p><span class="badge ${avoid.level === 'hard' ? 'avoid' : 'mild'}">uitstellen</span> ${esc(avoid.why)} <span class="src">${avoid.src.map((k) => `<a href="${esc(SOURCES[k].url)}" target="_blank" rel="noopener">${esc(SOURCES[k].name)}</a>`).join(' · ')}</span></p>` : ''}
      <hr>
      <div class="row">
        <label class="row"><input type="checkbox" class="tick" data-drawer-tick ${st.status === 'done' ? 'checked' : ''}> ${st.status === 'done' ? 'Binnen' : 'Afvinken'}</label>
        <a class="btn small ghost" href="${esc(wiki)}" target="_blank" rel="noopener">Wiki</a>
        ${gate?.src ? `<a class="btn small ghost" href="${esc(gate.src)}" target="_blank" rel="noopener">Bron vergrendeling</a>` : ''}
      </div>
    </section>`;
  let d = document.querySelector('.drawer[data-achdrawer]');
  if (fresh || !d) {
    d = openDrawer(html, () => { openId = null; });
    d.dataset.achdrawer = '1';
    d.addEventListener('change', (e) => {
      if (e.target.matches('[data-drawer-tick]')) toggle(openId, e.target.checked);
    });
  } else {
    d.innerHTML = `<button type="button" class="btn small close" data-close>Sluiten ✕</button>${html}`;
  }
}
