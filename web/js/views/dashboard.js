import { store } from '../store.js';
import { CHAR_BY_KEY } from '../../data/characters.js';
import { SOURCES } from '../../data/route.js';
import { bestRuns, quickWins, routeProgress, metaNotes } from '../advisor.js';
import { esc, glyph, markName, portrait, achChip, bar, timeAgo, achIcon } from '../ui.js';
import { openCharacter } from './characters.js';

function srcLinks(keys = []) {
  return keys.map((k) => `<a href="${esc(SOURCES[k].url)}" target="_blank" rel="noopener">${esc(k === 'WIKI' ? 'wiki' : SOURCES[k].name)}</a>`).join(' · ');
}

function runCard(model, plan, big = false) {
  const c = CHAR_BY_KEY[plan.char];
  const marks = plan.marks.map((m) => `<span class="mark-pill" title="${esc(markName(m))}">${glyph(m)}${esc(markName(m))}</span>`).join('');
  const skipped = plan.skipped.map((s) => `<span class="mark-pill skip" title="Overslaan: levert ${esc(s.ids.map((id) => model.byId.get(id).name).join(', '))} op">${glyph(s.mark)}${esc(markName(s.mark))}</span>`).join('');
  const gains = (plan.fresh || plan.gains).map((id) => achChip(model, id, plan.warnings.some((w) => w.id === id) ? 'avoid' : '')).join('');
  return `
    <div class="who">
      ${portrait(model, plan.char)}
      <div>
        <div class="ink-label">${big ? 'Beste volgende run' : plan.name}</div>
        <div class="name">${esc(c.name)}: ${esc(plan.name)}</div>
      </div>
    </div>
    <ol class="path">${plan.path.map((p) => `<li>${esc(p)}</li>`).join('')}</ol>
    <h4>Marks in deze run</h4>
    <div class="mark-pills">${marks}${skipped}</div>
    ${skipped ? `<p class="muted">Doorgestreept: bewust overslaan, levert alleen een unlock op die de guides willen uitstellen.</p>` : ''}
    ${plan.closet ? `<p><b>Plus:</b> open de kast in Home voor <b>Tainted ${esc(c.name.replace(/^The /, ''))}</b>.</p>` : ''}
    <h4>Levert op</h4>
    <div class="chips">${gains || '<span class="muted">Alleen marks.</span>'}</div>
    ${plan.hardOnly.length ? `<p class="muted">Op <b>Hard</b> ook: ${plan.hardOnly.map((id) => esc(model.byId.get(id).name)).join(', ')}. Hard telt ook als Normal.</p>` : ''}
    ${plan.warnings.length ? `<p class="muted">⚠ ${plan.warnings.map((w) => `<b>${esc(model.byId.get(w.id).name)}</b>: ${esc(w.why)}`).join(' ')}</p>` : ''}`;
}

export function mount(root) {
  root.addEventListener('click', onClick);
  update(root);
}

export function unmount() {}

function onClick(e) {
  const run = e.target.closest('[data-char]');
  if (run) openCharacter(run.dataset.char);
}

export function update(root) {
  const { model, state } = store;
  const runs = bestRuns(model, state, 6);
  const quick = quickWins(model, state, 5);
  const route = routeProgress(model, state);
  const notes = metaNotes(model, state);
  const fresh = !state.sources.save && !state.sources.steam && state.achievements.size === 0;

  const currentStep = route.steps.find((s) => s.key === route.current);
  const nextSteps = route.steps.filter((s) => s.status !== 'done').slice(0, 3);

  root.innerHTML = `
    <h1 class="view-title">De kelder</h1>
    <p class="view-sub">${fresh
      ? 'Nog geen voortgang. Importeer je save om te beginnen.'
      : `Je laatste stand${state.sources.save ? ` uit je save (${timeAgo(state.sources.save.at)} geleden)` : ''}. Dit is wat nu het meeste oplevert.`}</p>

    ${fresh ? `
      <section class="paper tape tilt-l" style="max-width:640px">
        <h3>Eerst je save inlezen</h3>
        <p>Daarmee staan al je geheimen, marks (normal én hard) en tellers er in één keer in.</p>
        <p><a class="btn blood" href="#/sync">Naar Sync</a></p>
      </section>` : ''}

    ${runs.length ? `
    <section class="hero">
      <article class="paper tape next-run tilt-l">${runCard(model, runs[0], true)}</article>
      <aside class="slab">
        <h2 class="section-title" style="margin-top:0">Daarna <small>elk personage één keer</small></h2>
        <div class="runs">
          ${runs.slice(1).map((p) => `
            <button type="button" class="run-row" data-char="${p.char}">
              ${portrait(model, p.char)}
              <span><b>${esc(CHAR_BY_KEY[p.char].name)} · ${esc(p.name)}</b>
              <span>${p.marks.map((m) => esc(markName(m))).join(', ')}${p.closet ? ' + kast' : ''}</span></span>
              <span class="score" title="Score: ${p.score.toFixed(1)}">+${p.fresh.length}</span>
            </button>`).join('')}
        </div>
      </aside>
    </section>` : ''}

    <div class="grid cols-3" style="margin-top:26px">
      <section class="paper tilt-r">
        <h3>Bijna binnen</h3>
        ${quick.length ? `<div class="quick">${quick.map((q) => `
          <div class="quick-item">
            ${achIcon(model, q.id)}
            <div>
              <b>${esc(model.byId.get(q.id).name)}</b>${q.avoid ? ' <span class="badge mild">uitstellen?</span>' : ''}
              <div class="num">${q.have} / ${q.need} ${esc(q.label)} · nog ${q.left}</div>
              ${bar(q.have, q.need, 'gold')}
            </div>
          </div>`).join('')}</div>` : '<p class="muted">Geen tellers die bijna vol zijn. Importeer je save voor de tellers.</p>'}
      </section>

      <section class="paper">
        <h3>Meta-route</h3>
        <p class="muted">${route.doneCount} van ${route.total} stappen klaar.${currentStep ? ` Je zit bij <b>${esc(route.phases.find((p) => p.key === currentStep.phase).name)}</b>.` : ''}</p>
        ${bar(route.doneCount, route.total)}
        <ol class="path">${nextSteps.map((s) => `<li><b>${esc(s.title)}</b> ${s.status === 'locked' ? '<span class="badge locked">op slot</span>' : ''}<br><span class="muted">${esc(s.why)}</span></li>`).join('')}</ol>
        <a class="btn small" href="#/route">Hele route</a>
      </section>

      <section class="paper tilt-l">
        <h3>Let op</h3>
        ${notes.length ? `<ul class="log" style="color:inherit">${notes.slice(0, 6).map((n) => n.kind === 'tip'
          ? `<li>💡 <span>${esc(n.text)} <span class="src">${srcLinks(n.src)}</span></span></li>`
          : `<li>${n.kind === 'pas-op' ? '⚠' : '✓'} <span><b>${esc(model.byId.get(n.id).name)}</b> ${n.kind === 'pas-op' ? 'ligt binnen bereik, maar' : 'heb je al;'} ${esc(n.why.charAt(0).toLowerCase() + n.why.slice(1))}</span></li>`).join('')}</ul>` : '<p class="muted">Niets bijzonders.</p>'}
      </section>
    </div>

    ${state.log.length ? `
    <h2 class="section-title">Laatst <small>wat er veranderde</small></h2>
    <div class="slab"><ul class="log">${state.log.slice(0, 8).map((l) => `<li><time>${timeAgo(l.t)}</time><span>${logLine(model, l)}</span></li>`).join('')}</ul></div>` : ''}
  `;
}

function logLine(model, l) {
  const name = (id) => esc(model.byId.get(id)?.name || `#${id}`);
  if (l.kind === 'save') return `Save ingelezen${l.gained?.length ? `: +${l.gained.length} (${l.gained.slice(0, 4).map(name).join(', ')}${l.gained.length > 4 ? '…' : ''})` : ', niets nieuws'}`;
  if (l.kind === 'steam') return `Steam-sync${l.gained?.length ? `: +${l.gained.length}` : ', niets nieuws'}`;
  if (l.kind === 'ach') return `${l.on ? 'Afgevinkt' : 'Uitgevinkt'}: ${name(l.id)}`;
  if (l.kind === 'mark') {
    const lvl = ['geen', 'normal', 'hard'][l.level];
    return `${esc(CHAR_BY_KEY[l.char]?.name)}: ${esc(markName(l.mark))} → ${lvl}${l.added?.length ? ` (+${l.added.map(name).join(', ')})` : ''}`;
  }
  return '';
}
