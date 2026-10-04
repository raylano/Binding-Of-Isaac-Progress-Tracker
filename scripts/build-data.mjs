// Bouwt web/data/achievements.json opnieuw op uit twee openbare bronnen:
//   1. de Cargo-tabel "achievement" van de officiele wiki (namen, eisen, DLC)
//   2. Steam, alleen voor de iconen: met STEAM_API_KEY via GetSchemaForGame, anders
//      via de publieke achievementpagina van STEAM_ID (een profiel dat Isaac heeft)
//
// Draai dit alleen als de wiki of het spel verandert; het resultaat staat in de repo
// zodat de site zelf nooit van de wiki afhankelijk is. Zonder Steam-gegevens blijven
// de iconen uit de huidige versie staan.
//
//   node scripts/build-data.mjs
//
// Wiki-inhoud valt onder CC BY-SA 3.0 (bindingofisaacrebirth.wiki.gg).

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'web', 'data', 'achievements.json');
const UA = 'BOIPT-tracker/1.0 (persoonlijke voortgangstracker)';

// STEAM_ID / STEAM_API_KEY uit .env, als die er is.
try {
  for (const line of (await fs.readFile(path.join(ROOT, '.env'), 'utf8')).split(/\r?\n/)) {
    const m = line.match(/^\s*(STEAM_ID|STEAM_API_KEY)\s*=\s*(\S*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch { /* geen .env */ }

const CARGO_URL =
  'https://bindingofisaacrebirth.wiki.gg/index.php?title=Special:CargoExport' +
  '&tables=achievement&fields=id,name,dlc,description,requirements,notes,link' +
  '&order+by=id&limit=1000&format=json';

// Repentance+ is bit 16 in de DLC-bitmask van de wiki (1 Rebirth, 2 Afterbirth,
// 4 Afterbirth+, 8 Repentance, 16 Repentance+).
const REP_PLUS = 16;

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&');
}

// Wikitekst -> platte tekst die voor Repentance+ geldt. Een DLC-icoon met cf-val-N
// zegt voor welke versies de tekst erna geldt; staat Repentance+ daar niet in, dan
// valt dat stuk weg tot het volgende icoon of de volgende regel.
export function cleanWikitext(raw) {
  if (!raw) return '';
  const s = decodeEntities(raw);
  const lines = s.split(/<br\s*\/?>/i);
  const kept = [];
  for (const line of lines) {
    const parts = line.split(/(\[\[File:Dlc [^\]]*\]\])/);
    let applies = true;
    let text = '';
    for (const part of parts) {
      const dlc = part.match(/^\[\[File:Dlc [^\]]*cf-val-(\d+)/);
      if (dlc) {
        applies = (Number(dlc[1]) & REP_PLUS) !== 0;
        continue;
      }
      if (applies) text += part;
    }
    text = text
      .replace(/\[\[File:[^\]]*\]\]/g, '')
      .replace(/\[\[:?([^\]|]*)\|([^\]]*)\]\]/g, '$2')
      .replace(/\[\[:?([^\]]*)\]\]/g, (_, p) => p.split('#')[0])
      .replace(/<[^>]+>/g, '')
      .replace(/'''?/g, '')
      .replace(/\s+/g, ' ')
      .replace(/\s+([,.)])/g, '$1')
      .replace(/\(\s+/g, '(')
      .trim();
    if (text) kept.push(text);
  }
  return kept.join(' ');
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${url} gaf HTTP ${res.status}`);
  return res.text();
}

async function steamIcons() {
  const icons = new Map();
  const { STEAM_API_KEY: key, STEAM_ID: id } = process.env;
  try {
    if (key) {
      const url = `https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/?appid=250900&key=${encodeURIComponent(key)}`;
      const schema = JSON.parse(await fetchText(url));
      for (const a of schema.game?.availableGameStats?.achievements || []) icons.set(Number(a.name), a.icon);
    } else if (/^\d{17}$/.test(id || '')) {
      const xml = await fetchText(`https://steamcommunity.com/profiles/${id}/stats/250900/achievements/?xml=1`);
      for (const m of xml.matchAll(/<achievement[^>]*>([\s\S]*?)<\/achievement>/g)) {
        const api = m[1].match(/<apiname><!\[CDATA\[(\d+)\]\]>/);
        const icon = m[1].match(/<iconClosed><!\[CDATA\[([^\]]+)\]\]>/);
        if (api && icon) icons.set(Number(api[1]), icon[1]);
      }
    }
  } catch (err) {
    console.warn('Steam-iconen niet opgehaald:', err.message);
  }
  if (!icons.size) {
    // Terugvallen op de iconen die er al staan.
    try {
      for (const a of JSON.parse(await fs.readFile(OUT, 'utf8'))) if (a.icon) icons.set(a.id, a.icon);
      console.warn('Geen STEAM_API_KEY of STEAM_ID: bestaande iconen behouden.');
    } catch { /* eerste keer */ }
  }
  return icons;
}

async function main() {
  const rows = JSON.parse(await fetchText(CARGO_URL));
  const icons = await steamIcons();

  const out = rows
    .map((r) => ({
      id: Number(r.id),
      name: decodeEntities(r.name || ''),
      unlock: cleanWikitext(r.description),
      how: cleanWikitext(r.requirements),
      note: cleanWikitext(r.notes),
      dlc: Number(r.dlc),
      page: r.link ? decodeEntities(r.link) : null,
      icon: icons.get(Number(r.id)) || null,
    }))
    .sort((a, b) => a.id - b.id);

  // Sanity: 1..N zonder gaten, anders klopt de koppeling met save en Steam niet meer.
  out.forEach((a, i) => {
    if (a.id !== i + 1) throw new Error(`Gat in de ID-reeks bij ${i + 1}`);
  });

  for (const a of out) if (!a.note) delete a.note;
  await fs.writeFile(OUT, JSON.stringify(out, null, 0).replace(/\},\{/g, '},\n{') + '\n');
  console.log(`${out.length} achievements weggeschreven naar ${path.relative(ROOT, OUT)}`);
  console.log(`${[...icons.keys()].length} Steam-iconen gekoppeld`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
