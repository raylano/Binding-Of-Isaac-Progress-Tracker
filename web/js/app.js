import { store, api, loadAll, subscribe, AuthError } from './store.js';
import { totals } from './logic.js';
import { $, esc, pixel, toast, closeDrawer, drawerOpen } from './ui.js';
import * as dashboard from './views/dashboard.js';
import * as characters from './views/characters.js';
import * as mapView from './views/map.js';
import * as secrets from './views/secrets.js';
import * as routeView from './views/route.js';
import * as sync from './views/sync.js';

const ROUTES = {
  '': dashboard,
  personages: characters,
  kaart: mapView,
  geheimen: secrets,
  route: routeView,
  sync,
};

let current = null;

function parseHash() {
  const [name = '', ...rest] = location.hash.replace(/^#\/?/, '').split('/');
  return { name, arg: rest.join('/') ? decodeURIComponent(rest.join('/')) : null };
}

function renderHud() {
  const t = totals(store.model, store.state);
  // 12 hartjes = alle 641 achievements, zoals een volle hartenbalk.
  const units = (t.achievements / t.achievementsTotal) * 24;
  let hearts = '';
  for (let i = 0; i < 12; i++) {
    const left = units - i * 2;
    hearts += pixel(left >= 2 ? 'heart' : left >= 1 ? 'half' : 'empty');
  }
  $('#hud-hearts').innerHTML = hearts;
  $('#hud-hearts').title = `${t.achievements} van ${t.achievementsTotal} geheimen`;
  $('#hud-stats').innerHTML = `
    <span class="stat" title="Geheimen (achievements)">${pixel('coin', 'Geheimen')}${t.achievements}<small>/${t.achievementsTotal}</small></span>
    <span class="stat" title="Completion marks (waarvan op Hard: ${t.hard})">${pixel('bomb', 'Marks')}${t.marks}<small>/${t.marksTotal}</small></span>
    <span class="stat" title="Personages">${pixel('key', 'Personages')}${t.chars}<small>/${t.charsTotal}</small></span>`;
  const pill = $('#sync-pill');
  pill.className = `sync-pill ${store.status === 'saving' ? 'busy' : store.status === 'error' ? 'err' : ''}`;
  pill.querySelector('span').textContent = store.status === 'saving' ? 'opslaan…' : store.status === 'error' ? 'niet opgeslagen' : 'opgeslagen';
}

function render() {
  const { name, arg } = parseHash();
  const view = ROUTES[name] || dashboard;
  for (const a of document.querySelectorAll('#tabs .tab')) {
    const target = a.getAttribute('href').replace(/^#\/?/, '');
    if (target === name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  const main = $('#view');
  if (current !== view) {
    current?.unmount?.();
    current = view;
    main.innerHTML = '';
    view.mount(main, arg);
    window.scrollTo({ top: 0, behavior: 'instant' });
  } else {
    view.update?.(main, arg);
  }
  characters.refresh();
  secrets.refresh();
  renderHud();
}

// ---------- Slot ----------
let pinLength = 4;
function showLock(message = '') {
  closeDrawer(true);
  $('#hud').hidden = true;
  $('#footer').hidden = true;
  $('#view').innerHTML = '';
  current = null;
  const lock = $('#lock');
  lock.hidden = false;
  const input = $('#pin-input');
  lock.querySelector('.pin-dots').innerHTML = '<i></i>'.repeat(Math.min(Math.max(pinLength, 1), 12));
  const dots = [...lock.querySelectorAll('.pin-dots i')];
  const err = $('#pin-err');
  err.textContent = message;
  input.value = '';
  const paint = () => dots.forEach((d, i) => d.classList.toggle('on', i < input.value.length));
  paint();

  const submit = async (e) => {
    e?.preventDefault();
    if (!input.value) return;
    try {
      await api('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: input.value }),
      });
      lock.hidden = true;
      start();
    } catch (ex) {
      err.textContent = ex.message;
      input.value = '';
      paint();
      lock.querySelector('.door').classList.remove('shake');
      void lock.offsetWidth;
      lock.querySelector('.door').classList.add('shake');
    }
  };

  lock.onclick = (e) => {
    const b = e.target.closest('[data-k]');
    if (!b) return;
    if (b.dataset.k === 'back') input.value = input.value.slice(0, -1);
    else if (input.value.length < 12) input.value += b.dataset.k;
    paint();
    if (input.value.length === pinLength) submit();
  };
  $('#pin-form').onsubmit = submit;
  document.onkeydown = (e) => {
    if (lock.hidden) return;
    if (/^\d$/.test(e.key)) { input.value += e.key; paint(); if (input.value.length === pinLength) submit(); }
    else if (e.key === 'Backspace') { input.value = input.value.slice(0, -1); paint(); }
    else if (e.key === 'Enter') submit();
  };
}

let started = false;
async function start() {
  try {
    await loadAll();
  } catch (err) {
    if (err instanceof AuthError) return showLock();
    $('#view').innerHTML = `<div class="empty">De kelder is niet bereikbaar: ${esc(err.message)}</div>`;
    return;
  }
  $('#hud').hidden = false;
  $('#footer').hidden = false;
  if (!started) {
    started = true;
    // Elk achievement-chipje, waar ook, opent de uitleg.
    document.addEventListener('click', (e) => {
      if (e.target.closest('a, input, label')) return;
      const chip = e.target.closest('[data-ach]');
      if (chip) secrets.openAchievement(Number(chip.dataset.ach));
    });
    window.addEventListener('hashchange', () => {
      if (drawerOpen() && !parseHash().arg) closeDrawer();
      render();
    });
    subscribe((reason) => {
      if (reason === 'auth') return showLock('Je sessie is verlopen. Log opnieuw in.');
      if (reason === 'status') return renderHud();
      if (reason === 'conflict') toast({ kicker: 'BIJGEWERKT', title: 'Er was een nieuwere stand van een ander apparaat; die staat er nu.' });
      render();
    });
  }
  current = null;
  render();
}

(async function boot() {
  try {
    const s = await api('/session');
    pinLength = s.pinLength || 4;
    if (!s.configured) {
      showLock('Er is nog geen PIN ingesteld op de server (ACCESS_PIN in .env).');
      return;
    }
    if (!s.authed) return showLock();
    start();
  } catch (err) {
    $('#view').innerHTML = `<div class="empty">Server niet bereikbaar: ${esc(err.message)}</div>`;
  }
})();
