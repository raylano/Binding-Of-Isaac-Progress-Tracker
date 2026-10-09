// Login with email and password. The browser gets an HttpOnly cookie with a
// random session token; the sync script gets a separate token that it sends as
// "Authorization: Bearer <token>". Both are stored (hashed) in sessions.json,
// so logging out and revoking take effect immediately.

import { resolveSession, SESSION_TTL } from './accounts.js';

export const COOKIE = 'boipt_session';

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function setSessionCookie(req, res, token) {
  const attrs = [
    `${COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.floor(SESSION_TTL.browser / 1000)}`,
  ];
  if (req.secure) attrs.push('Secure');
  res.setHeader('Set-Cookie', attrs.join('; '));
}

export function clearSessionCookie(req, res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${req.secure ? '; Secure' : ''}`);
}

// { user, session, via } or null.
export function authenticate(req) {
  const auth = req.headers.authorization;
  if (auth !== undefined) {
    const m = /^Bearer ([A-Za-z0-9_-]+)$/.exec(auth.trim());
    const found = m && resolveSession(m[1], 'sync');
    return found ? { ...found, via: 'bearer' } : null;
  }
  const found = resolveSession(readCookie(req, COOKIE), 'browser');
  return found ? { ...found, via: 'cookie' } : null;
}

export function requireAuth(req, res, next) {
  const found = authenticate(req);
  if (!found) return res.status(401).json({ error: 'This door is locked. Please log in.' });
  req.user = found.user;
  req.session = found.session;
  next();
}

// Extra layer on top of SameSite=Strict: a state-changing request with an
// Origin from another site is rejected. Scripts without an Origin (sync) pass.
export function sameOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ error: 'Request from another site refused.' });
  const origin = req.headers.origin;
  if (origin) {
    let host = null;
    try { host = new URL(origin).host; } catch { /* invalid = reject */ }
    if (host !== req.headers.host) return res.status(403).json({ error: 'Request from another site refused.' });
  }
  next();
}
