// Client-side progress: load, modify, and write to the server (debounced).

import { buildModel, normalizeState, serializeState } from './logic.js';

const listeners = new Set();

export const store = {
  model: null,
  state: null,
  base: null, // updatedAt of the last known server version
  config: {},
  session: {},
  status: 'idle', // idle | saving | error
};

export class AuthError extends Error {}

export async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, { credentials: 'same-origin', ...opts });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) throw new AuthError(body.error || 'Not logged in');
  if (!res.ok) {
    const err = new Error(body.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

export async function loadAll() {
  const [achievements, progress, config, session] = await Promise.all([
    fetch('data/achievements.json').then((r) => r.json()),
    api('/progress'),
    api('/config'),
    api('/session'),
  ]);
  store.session = session;
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

// Modify the progress. fn receives the state and may mutate it.
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
      // Another device was faster: take over its state.
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
