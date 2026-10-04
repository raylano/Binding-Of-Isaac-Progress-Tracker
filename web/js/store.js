// Client-side stand: laden, wijzigen, en (vertraagd) naar de server schrijven.

import { buildModel, normalizeState, serializeState } from './logic.js';

const listeners = new Set();

export const store = {
  model: null,
  state: null,
  base: null, // updatedAt van de laatst bekende serverversie
  config: {},
  status: 'idle', // idle | saving | error
};

export class AuthError extends Error {}

export async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, { credentials: 'same-origin', ...opts });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) throw new AuthError(body.error || 'Niet ingelogd');
  if (!res.ok) {
    const err = new Error(body.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

export async function loadAll() {
  const [achievements, progress, config] = await Promise.all([
    fetch('data/achievements.json').then((r) => r.json()),
    api('/progress'),
    api('/config'),
  ]);
  store.model = buildModel(achievements);
  store.state = normalizeState(progress);
  store.base = progress.updatedAt || null;
  store.config = config;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(reason) {
  for (const fn of listeners) fn(reason);
}

let timer = null;
let pending = false;
let inflight = false;
let again = false;

// Wijzig de stand. fn krijgt de state en mag hem muteren.
export function mutate(fn, reason = 'change') {
  const out = fn(store.state);
  store.state.updatedAt = new Date().toISOString();
  emit(reason);
  scheduleSave();
  return out;
}

export function replaceState(raw, reason = 'replace') {
  store.state = normalizeState(raw);
  store.base = raw.updatedAt || null;
  emit(reason);
}

function setStatus(s) {
  store.status = s;
  emit('status');
}

export function scheduleSave(delay = 700) {
  pending = true;
  clearTimeout(timer);
  timer = setTimeout(flush, delay);
}

export async function flush() {
  if (inflight) {
    again = true;
    return;
  }
  inflight = true;
  setStatus('saving');
  try {
    const saved = await api('/progress', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base: store.base, state: serializeState(store.state) }),
    });
    store.base = saved.updatedAt;
    if (!again) pending = false;
    setStatus('idle');
  } catch (err) {
    if (err instanceof AuthError) {
      setStatus('error');
      emit('auth');
    } else if (err.status === 409 && err.body?.current) {
      // Een ander apparaat was sneller: neem die stand over.
      pending = false;
      replaceState(err.body.current, 'conflict');
      setStatus('idle');
    } else {
      setStatus('error');
      scheduleSave(5000);
    }
  } finally {
    inflight = false;
    if (again) {
      again = false;
      flush();
    }
  }
}

window.addEventListener('beforeunload', (e) => {
  if (pending) {
    e.preventDefault();
  }
});
