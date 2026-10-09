import { store } from '../store.js';
import { AVOID, SOURCES } from '../../data/route.js';
import { routeProgress } from '../advisor.js';
import { achStatus } from '../logic.js';
import { esc, achChip, bar, statusBadge } from '../ui.js';

const srcLinks = (keys) => keys.map((k) => `<a href="${esc(SOURCES[k].url)}" target="_blank" rel="noopener">${esc(k === 'WIKI' ? 'wiki' : SOURCES[k].name)}</a>`).join(' · ');

export function mount(root) {
  update(root);
}

export function unmount() {}

export function update(root) {
  const { model, state } = store;
  const rp = routeProgress(model, state);
  let n = 0;
  const phases = rp.phases.map((ph) => {
    const steps = rp.steps.filter((s) => s.phase === ph.key);
    const done = steps.filter((s) => s.status === 'done').length;
    return `
      <section class="phase">
        <div class="phase-head"><h3>${esc(ph.name)}</h3><p>${esc(ph.note)} · ${done}/${steps.length}</p></div>
        <div class="steps">${steps.map((s) => {
          n++;
          const cur = s.key === rp.current;
          return `
          <article class="paper step ${s.status} ${cur ? 'current' : ''}">
            <div class="st">${s.status === 'done' ? '✓' : n}</div>
            <div>
              <h4>${esc(s.title)} ${s.status === 'done' ? '' : statusBadge(s.status)}</h4>
              <p class="muted">${esc(s.why)}</p>
              <div class="chips">${s.ach.map((id) => achChip(model, id, state.achievements.has(id) ? '' : 'todo')).join('')}</div>
              <p class="src">Source: ${srcLinks(s.src)}</p>
            </div>
          </article>`;
        }).join('')}</div>
      </section>`;
  }).join('');

  const avoid = Object.entries(AVOID).map(([id, a]) => ({ id: Number(id), ...a, st: achStatus(model, state, Number(id)) }))
    .sort((x, y) => (x.level === y.level ? 0 : x.level === 'hard' ? -1 : 1));

  root.innerHTML = `
    <h1 class="view-title">Route</h1>
    <p class="view-sub">The order the community guides recommend, compared with your progress. How to get each part comes from the wiki (tap a chip).</p>
    <div class="slab" style="margin-bottom:22px">
      <div class="row" style="justify-content:space-between"><b style="font-family:var(--font-hand);font-weight:400;font-size:20px">${rp.doneCount} of ${rp.total} steps</b>
      <span class="src">${srcLinks(['JNUB', 'PIEL', 'TINF'])}</span></div>
      <div style="margin-top:8px">${bar(rp.doneCount, rp.total)}</div>
    </div>
    ${phases}
    <h2 class="section-title">Better postponed <small>unlocks that make your item pool worse</small></h2>
    <div class="ach-list">${avoid.map((a) => {
      const ach = model.byId.get(a.id);
      const label = a.st.status === 'done' ? 'already unlocked' : a.st.status === 'open' ? 'within reach: careful' : 'still far away';
      return `<article class="paper ach" data-ach="${a.id}" style="grid-template-columns:40px minmax(0,1fr);cursor:pointer">
        <img class="ach-ico ${a.st.status === 'done' ? '' : a.st.status}" src="${esc(ach.icon || '')}" alt="" loading="lazy" width="40" height="40">
        <div>
          <div class="t"><b>${esc(ach.name)}</b><span class="badge ${a.level === 'hard' ? 'avoid' : 'mild'}">${a.level === 'hard' ? 'really postpone' : 'no hurry'}</span><span class="badge ${a.st.status}">${label}</span></div>
          <div class="h">${esc(ach.how)}</div>
          <div class="u" style="font-style:normal">${esc(a.why)} <span class="src">${srcLinks(a.src)}</span></div>
        </div>
      </article>`;
    }).join('')}</div>`;
}
