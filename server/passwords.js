// Normalise/validate email addresses and hash passwords with scrypt.
// Format on disk: scrypt$N$r$p$<salt>$<hash> (base64url), so the parameters
// can be raised later without breaking old hashes.

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

// Lowercase, with surrounding whitespace removed. Dots and +labels are kept:
// their meaning differs per provider, so merging them is not safe.
export function normalizeEmail(raw) {
  return typeof raw === 'string' ? raw.normalize('NFC').trim().toLowerCase() : '';
}

export function emailProblem(email) {
  if (!email) return 'Enter your email address.';
  if (email.length > 254 || !EMAIL.test(email)) return 'That is not a valid email address.';
  return null;
}

export function passwordProblem(password, email = '') {
  if (typeof password !== 'string') return 'Enter a password.';
  const length = [...password].length;
  if (length < PASSWORD_MIN) return `Your password must be at least ${PASSWORD_MIN} characters.`;
  if (length > PASSWORD_MAX) return `Your password can be at most ${PASSWORD_MAX} characters.`;
  if (/^(.)\1*$/su.test(password)) return 'Choose a password that is not one repeated character.';
  if (email && password.toLowerCase() === email) return 'Your password cannot be your email address.';
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
  // Bounded so a malformed line cannot blow up the server.
  if (!(n >= 2 && n <= 2 ** 20 && r >= 1 && r <= 32 && p >= 1 && p <= 16)) return false;
  const salt = Buffer.from(parts[4], 'base64url');
  const expected = Buffer.from(parts[5], 'base64url');
  if (!expected.length) return false;
  const actual = await scrypt(password.normalize('NFC'), salt, expected.length, { N: n, r, p, maxmem: maxmem(n, r) });
  return crypto.timingSafeEqual(actual, expected);
}

// For unknown email addresses we still compute a hash, so the response time
// does not reveal whether an account exists.
let dummy = null;
export async function burnPasswordCheck(password) {
  dummy ??= hashPassword(crypto.randomBytes(16).toString('hex'));
  await verifyPassword(typeof password === 'string' ? password : '', await dummy);
  return false;
}
