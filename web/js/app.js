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

// ---------- Slot: inloggen of registreren ----------
let authMode = 'login';
function showLock(message = '') {
  closeDrawer(true);
  $('#hud').hidden = true;
  $('#footer').hidden = true;
  $('#view').innerHTML = '';
  current = null;
  const lock = $('#lock');
  lock.hidden = false;
  const form = $('#auth-form');
  const err = $('#pin-err');
  err.textContent = message;
  form.password.value = '';

  const setMode = (mode) => {
    authMode = mode;
    for (const b of lock.querySelectorAll('[data-mode]')) b.setAttribute('aria-selected', String(b.dataset.mode === mode));
    $('#auth-hint').hidden = mode !== 'register';
    form.password.autocomplete = mode === 'register' ? 'new-password' : 'current-password';
    $('#auth-submit').textContent = mode === 'register' ? 'Account maken' : 'Naar binnen';
    $('#auth-intro').textContent = mode === 'register'
      ? 'Maak een account; je voortgang is alleen van jou.'
      : 'Log in om je eigen kelder in te gaan.';
  };
  setMode(authMode);
  lock.querySelector('.auth-tabs').onclick = (e) => {
    const b = e.target.closest('[data-mode]');
    if (b) { setMode(b.dataset.mode); err.textContent = ''; }
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    const password = form.password.value;
    if (!email || !password) { err.textContent = 'Vul je e-mailadres en wachtwoord in.'; return; }
    $('#auth-submit').disabled = true;
    try {
      await api(authMode === 'register' ? '/register' : '/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      form.password.value = '';
      lock.hidden = true;
      start();
    } catch (ex) {
      err.textContent = ex.message;
      form.password.value = '';
      lock.querySelector('.door').classList.remove('shake');
      void lock.offsetWidth;
      lock.querySelector('.door').classList.add('shake');
    } finally {
      $('#auth-submit').disabled = false;
    }
  };
  (form.email.value ? form.password : form.email).focus();
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
    if (!s.authed) return showLock();
    start();
  } catch (err) {
    $('#view').innerHTML = `<div class="empty">Server niet bereikbaar: ${esc(err.message)}</div>`;
  }
})();
