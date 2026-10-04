// Toegang met één PIN. Na het inloggen krijg je een gesigneerde cookie
// (verloopdatum + HMAC), zodat de server geen sessies hoeft te onthouden.
// Scripts zonder browser sturen de PIN als "Authorization: Bearer <pin>".

import crypto from 'node:crypto';
import { config } from './config.js';

export const COOKIE = 'boipt_session';

const hmac = (data) => crypto.createHmac('sha256', config.secret).update(data).digest('base64url');

function sameSecret(a, b) {
  // Gelijke lengte afdwingen via een hash, dan pas constant-time vergelijken.
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function pinMatches(pin) {
  return Boolean(config.pin) && typeof pin === 'string' && sameSecret(pin, config.pin);
}

export function makeToken(now = Date.now()) {
  const exp = now + config.sessionDays * 24 * 3600 * 1000;
  const body = `v1.${exp}`;
  return `${body}.${hmac(body)}`;
}

export function tokenValid(token, now = Date.now()) {
  if (typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return false;
  const body = `${parts[0]}.${parts[1]}`;
  if (!sameSecret(hmac(body), parts[2])) return false;
  return Number(parts[1]) > now;
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export function setSessionCookie(req, res) {
  const attrs = [
    `${COOKIE}=${makeToken()}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${config.sessionDays * 24 * 3600}`,
  ];
  if (req.secure) attrs.push('Secure');
  res.setHeader('Set-Cookie', attrs.join('; '));
}

export function clearSessionCookie(req, res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${req.secure ? '; Secure' : ''}`);
}

export function isAuthed(req) {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return pinMatches(auth.slice(7).trim());
  return tokenValid(readCookie(req, COOKIE));
}

export function requireAuth(req, res, next) {
  if (isAuthed(req)) return next();
  res.status(401).json({ error: 'Deze deur is op slot. Log in met je PIN.' });
}
