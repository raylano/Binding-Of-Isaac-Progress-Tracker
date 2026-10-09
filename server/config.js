import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { normalizeEmail } from './passwords.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Read .env without an extra package. Docker already passes the values as
// environment variables; locally (npm run dev) we pick them up here. Existing
// environment variables win.
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

const env = process.env;

// PUBLIC_URL is the address players use, e.g. https://your-domain.example. There is
// deliberately no built-in default: every deployment sets its own. Only https,
// or plain http for localhost while developing.
export function parsePublicUrl(raw) {
  const value = String(raw || '').trim().replace(/\/+$/, '');
  if (!value) return '';
  let url;
  try { url = new URL(value); } catch { return null; }
  const local = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !local) || url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
  return url.origin;
}

const publicUrl = parsePublicUrl(env.PUBLIC_URL);
if (publicUrl === null) console.warn('!! PUBLIC_URL is not a valid https:// origin (for example https://isaac.example.com); ignoring it.');

export const config = {
  port: Number(env.PORT) || 8080,
  host: env.HOST || '0.0.0.0',
  dataDir: path.resolve(env.DATA_DIR || path.join(ROOT, 'data')),
  publicUrl: publicUrl || '',
  steamKey: env.STEAM_API_KEY || '',
  // Behind nginx the real IP comes from X-Forwarded-For. Locally without a proxy: 0.
  trustProxy: env.TRUST_PROXY === undefined ? 1 : Number(env.TRUST_PROXY),
  // The account with this email address is the admin. ADMIN_PASSWORD (read once
  // by bootstrapAdmin, never stored here) creates it on first start.
  adminEmail: normalizeEmail(env.ADMIN_EMAIL || ''),
  // Browser sessions; sync tokens last a year (see accounts.js).
  sessionDays: 30,
};

fs.mkdirSync(config.dataDir, { recursive: true });

for (const name of ['ACCESS_PIN', 'STEAM_ID', 'SESSION_SECRET']) {
  if (env[name]) console.warn(`!! ${name} is no longer used and can be removed from .env.`);
}
