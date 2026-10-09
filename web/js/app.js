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
  characters,
  map: mapView,
  secrets,
  route: routeView,
  sync,
};

// Old (Dutch) hash routes from bookmarks keep working.
const ALIASES = { personages: 'characters', kaart: 'map', geheimen: 'secrets' };

let current = null;

function parseHash() {
  const [raw = '', ...rest] = location.hash.replace(/^#\/?/, '').split('/');
  const name = ALIASES[raw] || raw;
  return { name, arg: rest.join('/') ? decodeURIComponent(rest.join('/')) : null };
}

function renderHud() {
  const t = totals(store.model, store.state);
  // 12 hearts = all 641 achievements, like a full health bar.
  const units = (t.achievements / t.achievementsTotal) * 24;
  let hearts = '';
  for (let i = 0; i < 12; i++) {
    const left = units - i * 2;
    hearts += pixel(left >= 2 ? 'heart' : left >= 1 ? 'half' : 'empty');
  }
  $('#hud-hearts').innerHTML = hearts;
  $('#hud-hearts').title = `${t.achievements} of ${t.achievementsTotal} secrets`;
  $('#hud-stats').innerHTML = `
    <span class="stat" title="Secrets (achievements)">${pixel('coin', 'Secrets')}${t.achievements}<small>/${t.achievementsTotal}</small></span>
    <span class="stat" title="Completion marks (on Hard: ${t.hard})">${pixel('bomb', 'Marks')}${t.marks}<small>/${t.marksTotal}</small></span>
    <span class="stat" title="Characters">${pixel('key', 'Characters')}${t.chars}<small>/${t.charsTotal}</small></span>`;
  const pill = $('#sync-pill');
  pill.className = `sync-pill ${store.status === 'saving' ? 'busy' : store.status === 'error' ? 'err' : ''}`;
  pill.querySelector('span').textContent = store.status === 'saving' ? 'saving…' : store.status === 'error' ? 'not saved' : 'saved';
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

// ---------- Lock: log in or register ----------
let authMode = 'login';
function showLock(message = '', registrationOpen = false) {
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
  // The sign-up tab only appears while an admin has registration open; the
  // server refuses sign-ups otherwise anyway.
  lock.querySelector('.auth-tabs').hidden = !registrationOpen;
  if (!registrationOpen) authMode = 'login';

  const setMode = (mode) => {
    authMode = mode;
    for (const b of lock.querySelectorAll('[data-mode]')) b.setAttribute('aria-selected', String(b.dataset.mode === mode));
    $('#auth-hint').hidden = mode !== 'register';
    form.password.autocomplete = mode === 'register' ? 'new-password' : 'current-password';
    $('#auth-submit').textContent = mode === 'register' ? 'Create account' : 'Enter';
    $('#auth-intro').textContent = mode === 'register'
      ? 'Create an account; your progress belongs only to you.'
      : 'Log in to enter your own basement.';
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
    if (!email || !password) { err.textContent = 'Enter your email address and password.'; return; }
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

async function lockScreen(message = '') {
  let open = false;
  try {
    open = (await api('/session')).registrationOpen === true;
  } catch { /* server unreachable: show login only */ }
  showLock(message, open);
}

let started = false;
async function start() {
  try {
    await loadAll();
  } catch (err) {
    if (err instanceof AuthError) return lockScreen();
    $('#view').innerHTML = `<div class="empty">The basement is unreachable: ${esc(err.message)}</div>`;
    return;
  }
  $('#hud').hidden = false;
  $('#footer').hidden = false;
  if (!started) {
    started = true;
    // Every achievement chip, anywhere, opens its explanation.
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
      if (reason === 'auth') return lockScreen('Your session has expired. Please log in again.');
      if (reason === 'status') return renderHud();
      if (reason === 'conflict') toast({ kicker: 'UPDATED', title: 'Another device had newer progress; that is shown now.' });
      render();
    });
  }
  current = null;
  render();
}

(async function boot() {
  try {
    const s = await api('/session');
    if (!s.authed) return showLock('', s.registrationOpen === true);
    start();
  } catch (err) {
    $('#view').innerHTML = `<div class="empty">Server unreachable: ${esc(err.message)}</div>`;
  }
})();
