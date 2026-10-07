// Inloggen met e-mail en wachtwoord. De browser krijgt een HttpOnly-cookie met
// een willekeurig sessietoken; het sync-script krijgt een apart token dat het
// als "Authorization: Bearer <token>" meestuurt. Beide staan (gehasht) in
// sessions.json, zodat uitloggen en intrekken direct werken.

import crypto from 'node:crypto';
import { config } from './config.js';
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

// { user, session, via } of null.
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
  if (!found) return res.status(401).json({ error: 'Deze deur is op slot. Log in.' });
  req.user = found.user;
  req.session = found.session;
  next();
}

// Extra laag naast SameSite=Strict: een wijzigend verzoek met een Origin van een
// andere site wordt geweigerd. Scripts zonder Origin (sync) gaan gewoon door.
export function sameOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ error: 'Verzoek van een andere site geweigerd.' });
  const origin = req.headers.origin;
  if (origin) {
    let host = null;
    try { host = new URL(origin).host; } catch { /* ongeldig = weigeren */ }
    if (host !== req.headers.host) return res.status(403).json({ error: 'Verzoek van een andere site geweigerd.' });
  }
  next();
}

// De oude ACCESS_PIN dient alleen nog als bewijs bij het overnemen van de oude
// voortgang. Gelijke lengte via een hash, dan constant-time vergelijken.
export function pinMatches(pin) {
  if (!config.pin || typeof pin !== 'string') return false;
  const a = crypto.createHash('sha256').update(pin).digest();
  const b = crypto.createHash('sha256').update(config.pin).digest();
  return crypto.timingSafeEqual(a, b);
}
