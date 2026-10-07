import path from 'node:path';
import fs from 'node:fs';
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
  // Browsersessies; sync-tokens gelden een jaar (zie accounts.js).
  sessionDays: 30,
};

fs.mkdirSync(config.dataDir, { recursive: true });

// ACCESS_PIN is alleen nog nodig om de voortgang van vóór de accounts
// (data/progress.json) één keer over te nemen. Leeg = die overname staat uit.
if (!config.pin && fs.existsSync(path.join(config.dataDir, 'progress.json'))) {
  console.warn('!! data/progress.json bestaat maar ACCESS_PIN is leeg: de oude voortgang kan niet worden overgenomen.');
}
