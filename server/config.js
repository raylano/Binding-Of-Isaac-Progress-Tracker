import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// .env lezen zonder extra pakket. Docker geeft de waarden al als omgeving mee;
// lokaal (npm run dev) pakken we ze hier op. Bestaande omgeving wint.
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

const env = process.env;

export const config = {
  port: Number(env.PORT) || 8080,
  host: env.HOST || '0.0.0.0',
  dataDir: path.resolve(env.DATA_DIR || path.join(ROOT, 'data')),
  pin: env.ACCESS_PIN || '',
  steamId: env.STEAM_ID || '',
  steamKey: env.STEAM_API_KEY || '',
  // Achter nginx komt het echte IP uit X-Forwarded-For. Lokaal zonder proxy: 0.
  trustProxy: env.TRUST_PROXY === undefined ? 1 : Number(env.TRUST_PROXY),
  sessionDays: 30,
};

fs.mkdirSync(config.dataDir, { recursive: true });

// Sessiegeheim: uit .env, of eenmalig gegenereerd en bewaard in de datamap zodat
// een herstart je niet uitlogt.
function sessionSecret() {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  const file = path.join(config.dataDir, '.session-secret');
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    const secret = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(file, secret, { mode: 0o600 });
    return secret;
  }
}

config.secret = sessionSecret();

if (!config.pin) {
  console.warn('!! ACCESS_PIN ontbreekt in .env: niemand kan inloggen tot je hem invult.');
}
