// Small UI helpers without a framework.

import { CHAR_BY_KEY, MARKS } from '../data/characters.js';
import { store } from './store.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const $ = (sel, root = document) => root.querySelector(sel);

// ---------- Pixel icons (HUD) ----------
const PALETTE = { K: '#0b0705', R: '#d7322f', r: '#8c1215', W: '#ffe9e0', Y: '#e3b23c', D: '#9c7518', G: '#5b5f66', g: '#3a3d42', E: '#3a2a22', B: '#6d8fd0', b: '#3f5d97' };
const PIXELS = {
  heart: ['.KK...KK.', 'KRWK.KRRK', 'KRRRKRRrK', 'KRRRRRRrK', '.KRRRRrK.', '..KRRrK..', '...KrK...', '....K....'],
  half: ['.KK...KK.', 'KRWK.KEEK', 'KRRRKEEEK', 'KRRREEEEK', '.KRREEEK.', '..KREEK..', '...KEK...', '....K....'],
  empty: ['.KK...KK.', 'KEEK.KEEK', 'KEEEKEEEK', 'KEEEEEEEK', '.KEEEEEK.', '..KEEEK..', '...KEK...', '....K....'],
  soul: ['.KK...KK.', 'KBWK.KBBK', 'KBBBKBBbK', 'KBBBBBBbK', '.KBBBBbK.', '..KBBbK..', '...KbK...', '....K....'],
  coin: ['..KKKK..', '.KYYYYK.', 'KYYWYYDK', 'KYWYYYDK', 'KYYYYYDK', 'KYYYYDDK', '.KDDDDK.', '..KKKK..'],
  bomb: ['......W..', '.....W.W.', '....K....', '..KKKK...', '.KGGGGK..', 'KGWGGGgK.', 'KGGGGGgK.', '.KGGggK..', '..KKKK...'],
  key: ['..KKK....', '.KYYYK...', 'KYKKKYK..', 'KYK.KYK..', '.KYYYK...', '..KYK....', '..KYYK...', '..KYK....', '..KYYK...', '...K.....'],
};

export function pixel(name, title = '') {
  const rows = PIXELS[name];
  const h = rows.length;
  const w = rows[0].length;
  let rects = '';
  rows.forEach((row, y) => {
    [...row].forEach((c, x) => {
      if (c !== '.') rects += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${PALETTE[c]}"/>`;
    });
  });
  return `<svg viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" role="img" aria-label="${esc(title || name)}">${rects}</svg>`;
}

// ---------- Glyphs and icons ----------
export const glyph = (markKey, title = '') =>
  `<svg class="gl" viewBox="0 0 32 32" aria-hidden="${title ? 'false' : 'true'}"${title ? ` role="img" aria-label="${esc(title)}"` : ''}><use href="#g-${markKey}"/></svg>`;

export const markName = (key) => MARKS.find((m) => m.key === key)?.name || key;

// Portrait: the Steam icon of the achievement that unlocks the character.
// Isaac has none; for him we use "Isaac's Head".
export function portraitId(charKey) {
  const c = CHAR_BY_KEY[charKey];
  return c.unlock || 70;
}

export function achIcon(model, id, cls = '') {
  const a = model.byId.get(id);
  const src = a?.icon;
  if (!src) return `<span class="ach-ico ${cls}"></span>`;
  return `<img class="ach-ico ${cls}" src="${esc(src)}" alt="" loading="lazy" width="64" height="64">`;
}

export function portrait(model, charKey, cls = '') {
  const a = model.byId.get(portraitId(charKey));
  return `<img class="${cls}" src="${esc(a?.icon || '')}" alt="" loading="lazy" width="64" height="64">`;
}

export function achChip(model, id, extra = '') {
  const a = model.byId.get(id);
  if (!a) return '';
  if (store.state) extra += store.state.achievements.has(id) ? ' got' : ' todo';
  return `<button type="button" class="chip ${extra}" data-ach="${id}" title="${esc(a.how)}"><img src="${esc(a.icon || '')}" alt="" loading="lazy" width="26" height="26">${esc(a.name)}</button>`;
}

export function statusBadge(status) {
  const label = { done: 'unlocked', open: 'available', locked: 'locked' }[status] || status;
  return `<span class="badge ${status}">${label}</span>`;
}

export function bar(have, need, cls = '') {
  const pct = Math.max(0, Math.min(100, need ? (have / need) * 100 : 0));
  return `<div class="bar ${cls}" role="progressbar" aria-valuenow="${have}" aria-valuemin="0" aria-valuemax="${need}"><i style="width:${pct.toFixed(1)}%"></i></div>`;
}

export function timeAgo(t) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'moments';
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400) return `${Math.round(s / 3600)} h`;
  return `${Math.round(s / 86400)} d`;
}

// ---------- Toasts ----------
export function toast({ kicker = '', title = '', icon = '', action = null, ms = 4200 }) {
  const box = $('#toasts');
  const t = document.createElement('div');
  t.className = 'toast paper tape';
  t.innerHTML = `${icon ? `<img src="${esc(icon)}" alt="">` : '<span></span>'}
    <div><div class="k">${esc(kicker)}</div><div class="v">${esc(title)}</div></div>
    ${action ? `<button type="button" class="btn small">${esc(action.label)}</button>` : '<span></span>'}`;
  if (action) t.querySelector('button').addEventListener('click', () => { action.run(); close(); });
  box.prepend(t);
  while (box.children.length > 4) box.lastElementChild.remove();
  let timer = setTimeout(close, ms);
  t.addEventListener('mouseenter', () => clearTimeout(timer));
  t.addEventListener('mouseleave', () => { timer = setTimeout(close, 1500); });
  function close() {
    t.classList.add('out');
    setTimeout(() => t.remove(), 320);
  }
}

export function unlockedToasts(model, ids) {
  ids.slice(0, 3).forEach((id, i) => {
    const a = model.byId.get(id);
    if (a) setTimeout(() => toast({ kicker: 'SECRET UNLOCKED', title: a.name, icon: a.icon }), i * 260);
  });
  if (ids.length > 3) setTimeout(() => toast({ kicker: 'AND MORE', title: `${ids.length - 3} other secrets` }), 800);
}

// ---------- Drawer and modal ----------
let drawerClose = null;
export function openDrawer(html, onClose) {
  closeDrawer(true);
  const bg = document.createElement('div');
  bg.className = 'drawer-bg';
  const d = document.createElement('aside');
  d.className = 'drawer';
  d.setAttribute('role', 'dialog');
  d.setAttribute('aria-modal', 'true');
  d.innerHTML = `<button type="button" class="btn small close" data-close>Close ✕</button>${html}`;
  document.body.append(bg, d);
  const prevFocus = document.activeElement;
  d.querySelector('[data-close]').focus();
  const onKey = (e) => { if (e.key === 'Escape') closeDrawer(); };
  bg.addEventListener('click', () => closeDrawer());
  d.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeDrawer(); });
  document.addEventListener('keydown', onKey);
  drawerClose = (silent) => {
    document.removeEventListener('keydown', onKey);
    bg.remove();
    d.remove();
    drawerClose = null;
    prevFocus?.focus?.();
    if (!silent) onClose?.();
  };
  return d;
}
export function closeDrawer(silent = false) { drawerClose?.(silent); }
export const drawerOpen = () => Boolean(drawerClose);

export function modal(html) {
  return new Promise((resolve) => {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal paper" role="dialog" aria-modal="true">${html}</div>`;
    document.body.append(bg);
    const done = (v) => { bg.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') done(null); };
    document.addEventListener('keydown', onKey);
    bg.addEventListener('click', (e) => {
      if (e.target === bg) return done(null);
      const b = e.target.closest('[data-result]');
      if (b) done({ result: b.dataset.result, form: bg.querySelector('form') });
    });
    bg.querySelector('[data-result]')?.focus();
  });
}
