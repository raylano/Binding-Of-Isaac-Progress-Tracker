// Steam-proxy. De browser kan Steam niet zelf aanroepen (geen CORS) en de
// API-sleutel mag de browser nooit zien. Altijd voor het vaste STEAM_ID uit .env,
// zodat dit geen open proxy voor willekeurige profielen is.
//
// Met STEAM_API_KEY: officiële Web API. Zonder: de publieke XML-pagina van het
// profiel. Beide werken alleen als "Game details" op Openbaar staat.

import { config } from './config.js';

const APP = 250900;
const TTL = 60_000;
let cache = null;

export class SteamError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

async function viaApi() {
  const url = new URL('https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/');
  url.search = new URLSearchParams({ appid: APP, steamid: config.steamId, key: config.steamKey });
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

async function viaXml() {
  const url = `https://steamcommunity.com/profiles/${config.steamId}/stats/${APP}/achievements/?xml=1`;
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

export async function steamAchievements() {
  if (!/^\d{17}$/.test(config.steamId)) throw new SteamError('STEAM_ID ontbreekt in .env.', 500);
  if (cache && Date.now() - cache.at < TTL) return { ...cache.data, cached: true };
  const data = config.steamKey ? await viaApi() : await viaXml();
  data.count = data.ids.length;
  // 0 van 641 is bijna altijd een privé-instelling, niet een nieuw account.
  if (data.count === 0) {
    data.warning = 'Steam meldt 0 achievements. Meestal staat "Game details" op privé: Steam → Profiel bewerken → Privacy-instellingen → Game details: Openbaar.';
  }
  cache = { at: Date.now(), data };
  return data;
}
