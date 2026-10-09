// Accounts and sessions, each as a single JSON file in the data directory. The
// files are read on the first request and then kept in memory; every change is
// written out immediately (atomically). That works because there is one server
// process: do not run this app with multiple processes on one data directory.
//
// Session tokens are 32 random bytes. Only their SHA-256 is stored on disk, so
// a leaked sessions.json does not yield any valid cookies.

import crypto from 'node:crypto';
import path from 'node:path';
import { config } from './config.js';
import { readJsonSync, writeJson } from './jsonfile.js';

const USERS = path.join(config.dataDir, 'users.json');
const SESSIONS = path.join(config.dataDir, 'sessions.json');
const DAY = 24 * 3600 * 1000;

export const SESSION_TTL = { browser: config.sessionDays * DAY, sync: 365 * DAY };
const MAX_SESSIONS_PER_USER = 50;
const TOUCH_EVERY = 3600 * 1000;

export const USER_ID = /^[a-f0-9]{32}$/;

let users = null;
let sessions = null;

function db() {
  if (!users) {
    users = new Map();
    for (const u of readJsonSync(USERS, { users: [] }).users) if (USER_ID.test(u.id)) users.set(u.id, u);
    sessions = new Map();
    const now = Date.now();
    for (const s of readJsonSync(SESSIONS, { sessions: [] }).sessions) {
      if (s.expiresAt > now && users.has(s.userId)) sessions.set(s.tokenHash, s);
    }
  }
  return { users, sessions };
}

const saveUsers = () => writeJson(USERS, { version: 1, users: [...db().users.values()] });
const saveSessions = () => writeJson(SESSIONS, { version: 1, sessions: [...db().sessions.values()] });
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

export function findUserByEmail(email) {
  for (const u of db().users.values()) if (u.email === email) return u;
  return null;
}

export const getUser = (id) => db().users.get(id) || null;

export class AccountExists extends Error {}

// Hashing happens before this call (async); the duplicate-address check and the
// insert happen here with no await in between, so there is no race.
export async function createUser(email, passwordHash) {
  if (findUserByEmail(email)) throw new AccountExists();
  const user = {
    id: crypto.randomBytes(16).toString('hex'),
    email,
    passwordHash,
    steamId: null,
    createdAt: new Date().toISOString(),
  };
  db().users.set(user.id, user);
  await saveUsers();
  return user;
}

export async function updateUser(id, patch) {
  const user = getUser(id);
  if (!user) return null;
  Object.assign(user, patch);
  await saveUsers();
  return user;
}

export async function createSession(user, { kind = 'browser', label = '', userAgent = '' } = {}) {
  const now = Date.now();
  const token = crypto.randomBytes(32).toString('base64url');
  const session = {
    id: crypto.randomBytes(8).toString('hex'),
    tokenHash: hashToken(token),
    userId: user.id,
    kind,
    label: String(label).slice(0, 60),
    userAgent: String(userAgent).slice(0, 160),
    createdAt: now,
    lastSeen: now,
    expiresAt: now + SESSION_TTL[kind],
  };
  const { sessions: all } = db();
  // Clean up expired sessions and cap the count per account, oldest removed first.
  for (const [k, s] of all) if (s.expiresAt <= now) all.delete(k);
  const mine = [...all.values()].filter((s) => s.userId === user.id).sort((a, b) => a.lastSeen - b.lastSeen);
  for (const s of mine.slice(0, Math.max(0, mine.length - MAX_SESSIONS_PER_USER + 1))) all.delete(s.tokenHash);
  all.set(session.tokenHash, session);
  await saveSessions();
  return { token, session };
}

// Returns { user, session }, or null. kind must match: a browser cookie does
// not work as a bearer token, and vice versa.
export function resolveSession(token, kind) {
  if (typeof token !== 'string' || token.length < 40 || token.length > 100) return null;
  const { sessions: all } = db();
  const session = all.get(hashToken(token));
  if (!session || session.kind !== kind) return null;
  const now = Date.now();
  const user = getUser(session.userId);
  if (session.expiresAt <= now || !user) {
    all.delete(session.tokenHash);
    saveSessions().catch(() => {});
    return null;
  }
  if (now - session.lastSeen > TOUCH_EVERY) {
    session.lastSeen = now;
    saveSessions().catch((err) => console.error('sessions.json', err));
  }
  return { user, session };
}

export function listSessions(userId) {
  return [...db().sessions.values()]
    .filter((s) => s.userId === userId && s.expiresAt > Date.now())
    .sort((a, b) => b.lastSeen - a.lastSeen);
}

export async function revokeSession(userId, id) {
  const { sessions: all } = db();
  for (const s of all.values()) {
    if (s.id === id && s.userId === userId) {
      all.delete(s.tokenHash);
      await saveSessions();
      return true;
    }
  }
  return false;
}
