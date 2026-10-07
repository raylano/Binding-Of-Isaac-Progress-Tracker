// E-mail normaliseren/controleren en wachtwoorden hashen met scrypt.
// Formaat op schijf: scrypt$N$r$p$<salt>$<hash> (base64url), zodat de
// parameters later omhoog kunnen zonder oude hashes te breken.

import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const N = 32768;
const R = 8;
const P = 1;
const KEYLEN = 64;
const maxmem = (n, r) => 256 * n * r;

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

const EMAIL = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

// Kleine letters en zonder spaties eromheen. Punten en +labels blijven staan:
// dat is per provider verschillend en dus niet veilig samen te voegen.
export function normalizeEmail(raw) {
  return typeof raw === 'string' ? raw.normalize('NFC').trim().toLowerCase() : '';
}

export function emailProblem(email) {
  if (!email) return 'Vul je e-mailadres in.';
  if (email.length > 254 || !EMAIL.test(email)) return 'Dat is geen geldig e-mailadres.';
  return null;
}

export function passwordProblem(password, email = '') {
  if (typeof password !== 'string') return 'Vul een wachtwoord in.';
  const length = [...password].length;
  if (length < PASSWORD_MIN) return `Je wachtwoord moet minstens ${PASSWORD_MIN} tekens hebben.`;
  if (length > PASSWORD_MAX) return `Je wachtwoord mag hoogstens ${PASSWORD_MAX} tekens hebben.`;
  if (/^(.)\1*$/su.test(password)) return 'Kies een wachtwoord dat niet uit één teken bestaat.';
  if (email && password.toLowerCase() === email) return 'Je wachtwoord mag niet je e-mailadres zijn.';
  return null;
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password.normalize('NFC'), salt, KEYLEN, { N, r: R, p: P, maxmem: maxmem(N, R) });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [n, r, p] = parts.slice(1, 4).map(Number);
  // Begrenzen zodat een kapotte regel de server niet kan opblazen.
  if (!(n >= 2 && n <= 2 ** 20 && r >= 1 && r <= 32 && p >= 1 && p <= 16)) return false;
  const salt = Buffer.from(parts[4], 'base64url');
  const expected = Buffer.from(parts[5], 'base64url');
  if (!expected.length) return false;
  const actual = await scrypt(password.normalize('NFC'), salt, expected.length, { N: n, r, p, maxmem: maxmem(n, r) });
  return crypto.timingSafeEqual(actual, expected);
}

// Voor onbekende e-mailadressen rekenen we toch een hash uit, zodat de
// responstijd niet verraadt of een account bestaat.
let dummy = null;
export async function burnPasswordCheck(password) {
  dummy ??= hashPassword(crypto.randomBytes(16).toString('hex'));
  await verifyPassword(typeof password === 'string' ? password : '', await dummy);
  return false;
}
