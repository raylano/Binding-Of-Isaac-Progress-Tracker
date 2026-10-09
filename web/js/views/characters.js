import { store, mutate } from '../store.js';
import { CHARACTERS, CHAR_BY_KEY, MARKS, MARK_DISPLAY, MARK_INDEX } from '../../data/characters.js';
import { AVOID } from '../../data/route.js';
import { charUnlocked, markAccess, setMark, achStatus, blockerChain, describeReq, howOf, CLOSET_SRC } from '../logic.js';
import { plansFor } from '../advisor.js';
import { esc, glyph, markName, portrait, achChip, statusBadge, openDrawer, drawerOpen, unlockedToasts, toast } from '../ui.js';
import { qualityBadge, rewardBadge } from '../unlock-info.js';
import { tier4MarkUnlocks } from '../tier4-marks.js';

let filter = 'all';
let onlyUnlocked = false;
let openKey = null;

const LEVEL_NAME = ['not done', 'normal', 'hard'];

export function mount(root, arg) {
  root.addEventListener('click', onClick);
  update(root, arg);
}

export function unmount() {}

export function update(root, arg) {
  const { model, state } = store;
  const list = CHARACTERS.filter((c) => (filter === 'regular' ? !c.tainted : filter === 'tainted' ? c.tainted : true))
    .filter((c) => !onlyUnlocked || charUnlocked(state, c.key));
  const unlockedCount = CHARACTERS.filter((c) => charUnlocked(state, c.key)).length;

  root.innerHTML = `
    <h1 class="view-title">Characters</h1>
    <p class="view-sub">${unlockedCount} of ${CHARACTERS.length} unlocked. Tap a symbol to set a mark
      (empty → normal → <span style="color:var(--blood-bright)">hard</span> → empty), or open the note for details and the best plan.</p>
    <div class="filters">
      <div class="seg" role="group" aria-label="Kind">
        ${['all', 'regular', 'tainted'].map((f) => `<button type="button" data-filter="${f}" aria-pressed="${filter === f}">${f[0].toUpperCase() + f.slice(1)}</button>`).join('')}
      </div>
      <label class="row" style="color:var(--chalk-dim)"><input type="checkbox" data-only ${onlyUnlocked ? 'checked' : ''}> unlocked only</label>
    </div>
    <div class="char-grid">${list.map((c) => note(model, state, c)).join('')}</div>`;

  if (arg && arg !== openKey && CHAR_BY_KEY[arg]) openCharacter(arg, false);
}

// After every change: update an open drawer, regardless of which page is underneath.
export function refresh() {
  if (openKey && drawerOpen() && document.querySelector('.drawer[data-char]')) renderDrawer(openKey);
}

function note(model, state, c) {
  const unlocked = charUnlocked(state, c.key);
  const marks = state.marks[c.key];
  const done = marks.filter((v) => v > 0).length;
  const hard = marks.filter((v) => v > 1).length;
  let how = '';
  if (!unlocked) {
    const st = achStatus(model, state, c.unlock);
    const a = model.byId.get(c.unlock);
    how = `<div class="how">${statusBadge(st.status)} ${esc(c.tainted ? `Closet in Home as ${CHAR_BY_KEY[c.base].name}` : howOf(model, c.unlock))}</div>`;
  }
  return `
    <article class="paper note ${unlocked ? '' : 'locked'}" data-open="${c.key}" tabindex="0" aria-label="${esc(c.name)}">
      ${unlocked ? '' : '<div class="chain"></div>'}
      <div class="note-head">
        ${portrait(model, c.key)}
        <div><div class="n">${esc(c.short || c.name)}</div><div class="c">${done}/12 · hard ${hard}</div></div>
      </div>
      <div class="marks">
        ${MARK_DISPLAY.map((mk) => {
          const lvl = marks[MARK_INDEX[mk]];
          const blocked = unlocked && lvl === 0 && markAccess(model, state, c.key, mk).length > 0;
          return `<button type="button" class="mark ${blocked ? 'blocked' : ''}" data-mark="${mk}" data-char="${c.key}" data-level="${lvl}"
            title="${esc(markName(mk))}: ${LEVEL_NAME[lvl]}${blocked ? ' (not reachable yet)' : ''}" aria-label="${esc(markName(mk))}: ${LEVEL_NAME[lvl]}">${glyph(mk)}</button>`;
        }).join('')}
      </div>
      ${how}
    </article>`;
}

function onClick(e) {
  const f = e.target.closest('[data-filter]');
  if (f) { filter = f.dataset.filter; return update(e.currentTarget); }
  if (e.target.closest('[data-only]')) { onlyUnlocked = e.target.checked; return update(e.currentTarget); }
  const m = e.target.closest('.mark[data-mark]');
  if (m) {
    e.stopPropagation();
    cycleMark(m.dataset.char, m.dataset.mark);
    return;
  }
  const n = e.target.closest('[data-open]');
  if (n) openCharacter(n.dataset.open);
}

function cycleMark(charKey, markKey) {
  const { model } = store;
  const lvl = store.state.marks[charKey][MARK_INDEX[markKey]];
  applyMark(charKey, markKey, (lvl + 1) % 3);
  // Animation on the new element after the render.
  requestAnimationFrame(() => {
    document.querySelectorAll(`.mark[data-char="${charKey}"][data-mark="${markKey}"]`).forEach((el) => el.classList.add('pop'));
  });
  void model;
}

function applyMark(charKey, markKey, level) {
  const { model } = store;
  const { added, removed } = mutate((s) => setMark(model, s, charKey, markKey, level));
  if (added.length) unlockedToasts(model, added);
  if (removed.length) {
    toast({ kicker: 'REVERTED', title: removed.map((id) => model.byId.get(id).name).join(', ') });
  }
}

export function openCharacter(key, pushHash = true) {
  openKey = key;
  if (pushHash && /^#\/(characters|personages)/.test(location.hash) && location.hash !== `#/characters/${key}`) {
    history.replaceState(null, '', `#/characters/${key}`);
  }
  renderDrawer(key, true);
}

function renderDrawer(key, fresh = false) {
  const { model, state } = store;
  const c = CHAR_BY_KEY[key];
  const unlocked = charUnlocked(state, key);
  const marks = state.marks[key];
  const rewards = model.rewards[key];

  const unlockInfo = (() => {
    if (!c.unlock) return '<p class="muted">Playable from the start.</p>';
    const a = model.byId.get(c.unlock);
    const st = achStatus(model, state, c.unlock);
    const chain = st.status === 'locked' ? chainHtml(model, blockerChain(model, state, c.unlock)) : '';
    const extra = c.tainted
      ? `<p class="muted">Open the hidden closet in the hallway of Home as <b>${esc(CHAR_BY_KEY[c.base].name)}</b>. On your first visit the Red Key is guaranteed in Mom's Chest; after that you need a Cracked Key (leave a trinket in a Boss/Treasure Room before Dad's Note). One tainted per run. <a href="${CLOSET_SRC}" target="_blank" rel="noopener">wiki</a></p>`
      : `<p>${esc(howOf(model, c.unlock))}</p>`;
    return `<p>${statusBadge(st.status)} <b>${esc(a.name)}</b></p>${extra}${chain ? `<h4>Needed first</h4>${chain}` : ''}${
      st.progress ? `<p class="muted">${st.progress.have ?? '?'} / ${st.progress.need} ${esc(st.progress.label)}</p>` : ''}`;
  })();

  const markRows = MARK_DISPLAY.map((mk) => {
    const lvl = marks[MARK_INDEX[mk]];
    const access = markAccess(model, state, key, mk);
    const single = rewards[mk];
    const ids = [...(single?.[1] || []), ...(single?.[2] || [])];
    // Show grouped tainted rewards with every mark of the group.
    for (const r of Object.values(rewards)) {
      if (r.marks.length > 1 && r.marks.length < 12 && r.marks.includes(mk)) ids.push(...r[1]);
    }
    const chips = [...new Set(ids)].map((id) => achChip(model, id, AVOID[id] ? 'avoid' : '') + rewardBadge(id)).join('');
    const hardNote = single?.[2]?.length ? ' · hard gives extra' : '';
    return `
      <div class="mark-line" data-mark-row="${mk}">
        <span style="color:${lvl === 2 ? 'var(--blood)' : 'var(--ink)'}">${glyph(mk)}</span>
        <div>
          <div class="t">${esc(MARKS[MARK_INDEX[mk]].long)}</div>
          <div class="r">${access.length && lvl === 0 ? `Not reachable yet: ${access.map((r) => esc(describeReq(model, r))).join(', ')}` : esc(hardNote.slice(3))}</div>
          ${chips ? `<div class="chips" style="margin-top:4px">${chips}</div>` : ''}
        </div>
        <div class="lvl" role="group" aria-label="${esc(markName(mk))}">
          ${[0, 1, 2].map((v) => `<button type="button" data-set="${mk}" data-level="${v}" class="${v === 2 ? 'h' : ''}" aria-pressed="${lvl === v}" ${!unlocked ? 'disabled' : ''}>${['–', 'N', 'H'][v]}</button>`).join('')}
        </div>
      </div>`;
  }).join('');

  const allHard = rewards.all;
  const plans = unlocked ? plansFor(model, state, key) : [];
  const t4 = tier4MarkUnlocks(model, key);
  const pathName = (t) => (t.marks.length === 12 ? 'All 12 marks' : t.marks.map(markName).join(' + ')) + (t.level === 2 ? ' (Hard)' : '');
  const tier4Html = `
    <section class="paper">
      <h3>Tier 4 items from marks</h3>
      ${t4.tier4.length ? `<ul class="tier4-list">${t4.tier4.map((t) => `
        <li>
          ${t.marks.length < 12
            ? `<button type="button" class="mark-pill" data-goto-mark="${t.marks[0]}" title="Go to the mark below">${glyph(t.marks[0])}${esc(pathName(t))}</button>`
            : `<span class="mark-pill">${esc(pathName(t))}</span>`}
          → ${qualityBadge(t.id)} <b>${esc(t.item)}</b> ${achChip(model, t.id)}
          ${t.note ? `<span class="muted">${esc(t.note)}</span>` : ''}
        </li>`).join('')}</ul>`
        : `<p class="muted">No completion mark of ${esc(c.name)} adds a Tier 4 item (Item Quality 4) to the pool.</p>`}
      ${t4.other.length ? `<p class="muted">No Tier 4 item: ${t4.other.map((mk) => esc(markName(mk))).join(', ')}.</p>` : ''}
      ${t4.unclear.map((u) => `<p class="muted">Unclear, not counted: ${esc(u.item)} via ${esc(pathName(u))} (${esc(u.reason)}).</p>`).join('')}
    </section>`;

  const html = `
    <section class="paper tape">
      <div class="note-head">${portrait(model, key)}<div><div class="n" style="font-size:26px">${esc(c.name)}</div>
      <div class="c">${marks.filter(Boolean).length}/12 marks · ${marks.filter((v) => v === 2).length} hard</div></div></div>
      ${unlockInfo}
      ${allHard ? `<p class="muted">All 12 on Hard: ${allHard[2].map((id) => `<b>${esc(model.byId.get(id).name)}</b>`).join(', ')}.</p>` : ''}
    </section>
    ${tier4Html}
    <section class="paper">
      <h3>Completion marks</h3>
      <div class="mark-table">${markRows}</div>
    </section>
    ${plans.length ? `
    <section class="paper">
      <h3>Best runs with ${esc(c.short || c.name)}</h3>
      ${plans.slice(0, 3).map((p, i) => `
        ${i ? '<hr>' : ''}
        <h4>${esc(p.name)} <span class="muted" style="font-size:15px">· ${p.gains.length} unlocks</span></h4>
        <div class="mark-pills">${p.marks.map((m) => `<span class="mark-pill">${glyph(m)}${esc(markName(m))}</span>`).join('')}${p.skipped.map((s) => `<span class="mark-pill skip">${glyph(s.mark)}${esc(markName(s.mark))}</span>`).join('')}</div>
        ${p.skipped.length ? `<p class="muted">Skip ${p.skipped.map((s) => esc(markName(s.mark))).join(', ')}:${p.skipped.map((s) => s.ids.map((id) => `${esc(model.byId.get(id).name)} (${esc(AVOID[id].why)})`).join(', ')).join(' ')}</p>` : ''}
        <ol class="path">${p.path.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
        <div class="chips">${p.gains.map((id) => achChip(model, id, AVOID[id] ? 'avoid' : '') + rewardBadge(id)).join('')}</div>
        ${p.hardOnly.length ? `<p class="muted">On Hard also: ${p.hardOnly.map((id) => esc(model.byId.get(id).name)).join(', ')}.</p>` : ''}
      `).join('')}
    </section>` : ''}`;

  let d = document.querySelector('.drawer[data-char]');
  if (fresh || !d) {
    d = openDrawer(html, () => {
      openKey = null;
      if (/^#\/(characters|personages)\//.test(location.hash)) history.replaceState(null, '', '#/characters');
    });
    d.dataset.char = key;
    d.addEventListener('click', (e) => {
      const b = e.target.closest('[data-set]');
      if (b && !b.disabled) applyMark(key, b.dataset.set, Number(b.dataset.level));
      const go = e.target.closest('[data-goto-mark]');
      if (go) {
        const row = d.querySelector(`.mark-line[data-mark-row="${go.dataset.gotoMark}"]`);
        row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row?.classList.remove('flash');
        void row?.offsetWidth;
        row?.classList.add('flash');
      }
    });
  } else {
    const scroll = d.scrollTop;
    d.innerHTML = `<button type="button" class="btn small close" data-close>Close ✕</button>${html}`;
    d.scrollTop = scroll;
  }
}

export function chainHtml(model, nodes) {
  if (!nodes.length) return '';
  return `<ul class="chain-list">${nodes.map((n) => `<li>${n.id ? `<b>${esc(model.byId.get(n.id)?.name || n.label)}</b> — ${esc(howOf(model, n.id))}` : esc(n.label)}${n.children?.length ? chainHtml(model, n.children) : ''}</li>`).join('')}</ul>`;
}
