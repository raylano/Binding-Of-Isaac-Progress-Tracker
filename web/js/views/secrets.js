import { store, mutate } from '../store.js';
import { CHARACTERS, CHAR_BY_KEY } from '../../data/characters.js';
import { AVOID, SOURCES } from '../../data/route.js';
import { achStatus, blockerChain, setAchievement, describeReq, howOf, effectOf, GATES } from '../logic.js';
import { esc, achIcon, statusBadge, bar, openDrawer, drawerOpen, unlockedToasts, markName } from '../ui.js';
import { chainHtml } from './characters.js';
import { itemQualityOf, qualityBadge, challengeTipOf } from '../unlock-info.js';

const PAGE = 80;
let q = '';
let status = 'all';
let cat = 'all';
let who = '';
let limit = PAGE;
let openId = null;

const CATS = [
  ['all', 'All kinds'],
  ['char', 'Characters'],
  ['mark', 'Completion rewards'],
  ['challenge', 'Challenges'],
  ['counter', 'Counters'],
  ['avoid', 'Better postponed'],
  ['other', 'Other'],
];

function category(model, a) {
  if (model.charOfUnlock.has(a.id)) return 'char';
  if (model.markOf.has(a.id)) return 'mark';
  if (/challenge #/i.test(a.how)) return 'challenge';
  if (model.counterRule.has(a.id)) return 'counter';
  return 'other';
}

function matches(model, state, a, st) {
  if (status !== 'all' && st.status !== status) return false;
  if (cat === 'avoid') { if (!AVOID[a.id]) return false; } else if (cat !== 'all' && category(model, a) !== cat) return false;
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
    <h1 class="view-title">Secrets</h1>
    <p class="view-sub" id="sec-sub"></p>
    <div class="filters">
      <input class="search" type="search" id="sec-q" placeholder="Search by name, item or requirement…" value="${esc(q)}" aria-label="Search">
      <div class="seg" role="group" aria-label="Status">
        ${[['all', 'All'], ['done', 'Unlocked'], ['open', 'Available'], ['locked', 'Locked']].map(([k, l]) => `<button type="button" data-status="${k}" aria-pressed="${status === k}">${l}</button>`).join('')}
      </div>
      <select class="search" id="sec-cat" aria-label="Kind">${CATS.map(([k, l]) => `<option value="${k}" ${cat === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <select class="search" id="sec-who" aria-label="Character"><option value="">All characters</option>${CHARACTERS.map((c) => `<option value="${c.key}" ${who === c.key ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
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
  root.querySelector('#sec-sub').textContent = `${state.achievements.size} of ${model.achievements.length} unlocked · ${count} shown with these filters. Tick what you get; tap a row for the explanation.`;
  list.innerHTML = rows.join('') || '<div class="empty">Nothing found in this corner of the basement.</div>';
  root.querySelector('#sec-more').innerHTML = count > limit ? `<button type="button" class="btn ghost" data-more>Show more (${count - limit})</button>` : '';
}

function row(model, state, a, st) {
  const avoid = AVOID[a.id];
  const blk = st.status === 'locked'
    ? `<div class="blk">First: ${st.missing.slice(0, 4).map((r) => `<b>${esc(describeReq(model, r))}</b>`).join(', ')}${st.missing.length > 4 ? ` +${st.missing.length - 4}` : ''}</div>` : '';
  const prog = st.progress && st.status !== 'done' && st.progress.have !== null
    ? `<div class="prog">${bar(st.progress.have, st.progress.need, 'gold')}<span>${st.progress.have}/${st.progress.need}</span></div>` : '';
  const manual = state.manual.has(a.id) ? ' <span class="badge mild" title="Ticked by hand, not from your save">manual</span>' : '';
  return `
    <article class="paper ach" data-row="${a.id}">
      ${achIcon(model, a.id, st.status === 'done' ? '' : st.status)}
      <div>
        <div class="t"><b>${esc(a.name)}</b><span class="id">#${a.id}</span>${statusBadge(st.status)}${qualityBadge(a.id)}${avoid ? `<span class="badge ${avoid.level === 'hard' ? 'avoid' : 'mild'}" title="${esc(avoid.why)}">postpone</span>` : ''}${manual}</div>
        <div class="u">${esc(a.unlock)}</div>
        <div class="h">${esc(howOf(model, a.id))}</div>
        ${blk}${prog}
      </div>
      <input type="checkbox" class="tick" data-id="${a.id}" ${st.status === 'done' ? 'checked' : ''} aria-label="Tick ${esc(a.name)}">
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
  const effect = effectOf(model, a.id);
  const quality = itemQualityOf(a.id);
  const tip = challengeTipOf(model, a.id);
  const chain = st.status === 'locked' ? chainHtml(model, blockerChain(model, state, a.id)) : '';
  const wiki = a.page ? `https://bindingofisaacrebirth.wiki.gg/wiki/${encodeURIComponent(a.page.replace(/ /g, '_'))}` : SOURCES.WIKI.url;
  const html = `
    <section class="paper tape">
      <div class="note-head">${achIcon(model, a.id, st.status === 'done' ? '' : st.status)}<div><div class="n" style="font-size:24px">${esc(a.name)}</div><div class="c">#${a.id} · ${statusBadge(st.status)}</div></div></div>
      <p class="muted"><i>${esc(a.unlock)}</i></p>
      <h4>What it does</h4>
      <p${effect.known ? '' : ' class="muted"'}>${esc(effect.text)}</p>
      ${quality ? `<p>${qualityBadge(a.id)} Item Quality ${quality.quality} of 4 in Repentance+.${quality.note ? ` <span class="muted">${esc(quality.note)}</span>` : ''}</p>` : ''}
      <h4>How</h4>
      <p>${esc(howOf(model, a.id))}</p>
      ${tip ? `<h4>Tip for challenge #${tip.n}: ${esc(tip.name)}</h4><p>${esc(tip.tip)}</p><p class="muted src">Source: <a href="${esc(tip.src)}" target="_blank" rel="noopener">${esc(tip.name)} on the wiki</a></p>` : ''}
      ${a.note ? `<p class="muted">${esc(a.note)}</p>` : ''}
      ${mark ? `<p class="muted">Belongs to ${esc(CHAR_BY_KEY[mark.char].name)}'s mark${mark.marks.length > 1 ? 's' : ''} ${mark.marks.length === 12 ? 'all 12' : mark.marks.map(markName).join(' + ')}${mark.level === 2 ? ' (on Hard)' : ''}.</p>` : ''}
      ${st.progress ? `<h4>Counter</h4>${st.progress.have === null ? '<p class="muted">Unknown: import your save.</p>' : `${bar(st.progress.have, st.progress.need, 'gold')}<p class="muted">${st.progress.have} / ${st.progress.need} ${esc(st.progress.label)}</p>`}` : ''}
      ${chain ? `<h4>Needed first</h4>${chain}` : ''}
      ${avoid ? `<h4>Meta</h4><p><span class="badge ${avoid.level === 'hard' ? 'avoid' : 'mild'}">postpone</span> ${esc(avoid.why)} <span class="src">${avoid.src.map((k) => `<a href="${esc(SOURCES[k].url)}" target="_blank" rel="noopener">${esc(SOURCES[k].name)}</a>`).join(' · ')}</span></p>` : ''}
      <hr>
      <div class="row">
        <label class="row"><input type="checkbox" class="tick" data-drawer-tick ${st.status === 'done' ? 'checked' : ''}> ${st.status === 'done' ? 'Unlocked' : 'Tick off'}</label>
        <a class="btn small ghost" href="${esc(wiki)}" target="_blank" rel="noopener">Wiki</a>
        ${gate?.src ? `<a class="btn small ghost" href="${esc(gate.src)}" target="_blank" rel="noopener">Lock source</a>` : ''}
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
    d.innerHTML = `<button type="button" class="btn small close" data-close>Close ✕</button>${html}`;
  }
}
