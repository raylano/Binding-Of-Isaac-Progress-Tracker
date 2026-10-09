// Site settings that an admin can change, and the admin account itself.
//
// Settings live in data/settings.json, written atomically (0600). Anything
// missing or unreadable falls back to the safe default: registration closed.
//
// The admin is the account whose email equals ADMIN_EMAIL. On startup,
// bootstrapAdmin() creates that account from ADMIN_PASSWORD if it does not
// exist yet. The password is hashed, removed from process.env and never logged;
// once the account exists ADMIN_PASSWORD is ignored and can be deleted.

import path from 'node:path';
import { config } from './config.js';
import { readJsonSync, writeJson } from './jsonfile.js';
import { createUser, findUserByEmail, AccountExists } from './accounts.js';
import { emailProblem, passwordProblem, hashPassword } from './passwords.js';

const FILE = path.join(config.dataDir, 'settings.json');

let settings = null;

function load() {
  if (!settings) {
    let raw = {};
    try {
      raw = readJsonSync(FILE, {}) || {};
    } catch (err) {
      console.error(`!! ${FILE} is unreadable (${err.message}); using defaults (registration closed).`);
    }
    settings = { registrationOpen: raw.registrationOpen === true };
  }
  return settings;
}

export const getSettings = () => ({ ...load() });

export async function updateSettings(patch) {
  const next = { ...load() };
  if (typeof patch.registrationOpen === 'boolean') next.registrationOpen = patch.registrationOpen;
  await writeJson(FILE, { version: 1, ...next });
  settings = next;
  return { ...next };
}

export const isAdmin = (user) => Boolean(config.adminEmail && user && user.email === config.adminEmail);

export async function bootstrapAdmin({ email = config.adminEmail, password = process.env.ADMIN_PASSWORD } = {}) {
  delete process.env.ADMIN_PASSWORD;
  if (!email) return 'disabled';
  if (emailProblem(email)) {
    console.warn('!! ADMIN_EMAIL is not a valid email address; there is no admin.');
    return 'invalid-email';
  }
  if (findUserByEmail(email)) {
    if (password) console.log('Admin account already exists; ADMIN_PASSWORD is ignored and can be removed from .env.');
    return 'exists';
  }
  if (!password) {
    console.warn('!! No account exists for ADMIN_EMAIL yet. Set ADMIN_PASSWORD once to create it.');
    return 'missing-password';
  }
  const problem = passwordProblem(password, email);
  if (problem) {
    console.warn(`!! ADMIN_PASSWORD was rejected: ${problem} The admin account was not created.`);
    return 'weak-password';
  }
  try {
    await createUser(email, await hashPassword(password));
  } catch (err) {
    if (err instanceof AccountExists) return 'exists';
    throw err;
  }
  console.log('Admin account created for ADMIN_EMAIL. You can now remove ADMIN_PASSWORD from .env.');
  return 'created';
}
