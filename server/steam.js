// Steam-proxy. De browser kan Steam niet zelf aanroepen (geen CORS) en de
// API-sleutel mag de browser nooit zien. Altijd voor de SteamID die bij het
// ingelogde account is opgeslagen; nooit voor een ID uit het verzoek zelf.
//
// Met STEAM_API_KEY: officiële Web API. Zonder: de publieke XML-pagina van het
// profiel. Beide werken alleen als "Game details" op Openbaar staat.

import { config } from './config.js';

const APP = 250900;
const TTL = 60_000;
const cache = new Map();
export const STEAM_ID = /^7656119\d{10}$/;

export class SteamError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

async function viaApi(steamId) {
  const url = new URL('https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/');
  url.search = new URLSearchParams({ appid: APP, steamid: steamId, key: config.steamKey });
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  const body = await res.json().catch(() => null);
  if (res.status === 403 || body?.playerstats?.success === false) {
    throw new SteamError('Steam geeft geen achievements terug: zet "Game details" op Openbaar.', 403);
  }
  if (!res.ok) throw new SteamError(`Steam API gaf HTTP ${res.status}.`);
  const list = body?.playerstats?.achievements || [];
  return {
    source: 'api',
    ids: list.filter((a) => a.achieved).map((a) => Number(a.apiname)).filter(Number.isInteger),
  };
}

async function viaXml(steamId) {
  const url = `https://steamcommunity.com/profiles/${steamId}/stats/${APP}/achievements/?xml=1`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { 'User-Agent': 'BOIPT-tracker' } });
  if (!res.ok) throw new SteamError(`Steam gaf HTTP ${res.status}.`);
  const xml = await res.text();
  if (/<error>/.test(xml)) throw new SteamError('Steam-profiel niet gevonden of privé.', 403);
  const privacy = xml.match(/<privacyState>([^<]*)</)?.[1] || 'onbekend';
  const ids = [];
  for (const m of xml.matchAll(/<achievement closed="1">[\s\S]*?<apiname><!\[CDATA\[(\d+)\]\]><\/apiname>/g)) {
    ids.push(Number(m[1]));
  }
  return { source: 'xml', privacy, ids };
}

export async function steamAchievements(steamId) {
  if (!STEAM_ID.test(steamId || '')) throw new SteamError('Vul eerst je SteamID64 in bij Sync → Account.', 400);
  const hit = cache.get(steamId);
  if (hit && Date.now() - hit.at < TTL) return { ...hit.data, cached: true };
  const data = config.steamKey ? await viaApi(steamId) : await viaXml(steamId);
  data.count = data.ids.length;
  // 0 van 641 is bijna altijd een privé-instelling, niet een nieuw account.
  if (data.count === 0) {
    data.warning = 'Steam meldt 0 achievements. Meestal staat "Game details" op privé: Steam → Profiel bewerken → Privacy-instellingen → Game details: Openbaar.';
  }
  if (cache.size > 500) cache.clear();
  cache.set(steamId, { at: Date.now(), data });
  return data;
}
