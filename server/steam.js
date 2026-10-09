// Steam proxy. The browser cannot call Steam itself (no CORS), and the browser
// must never see the API key. Always for the SteamID stored with the logged-in
// account; never for an ID taken from the request itself.
//
// With STEAM_API_KEY: the official Web API. Without it: the profile's public
// XML page. Both only work if "Game details" is set to Public.

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
    throw new SteamError('Steam returned no achievements: set "Game details" to Public.', 403);
  }
  if (!res.ok) throw new SteamError(`Steam API returned HTTP ${res.status}.`);
  const list = body?.playerstats?.achievements || [];
  return {
    source: 'api',
    ids: list.filter((a) => a.achieved).map((a) => Number(a.apiname)).filter(Number.isInteger),
  };
}

async function viaXml(steamId) {
  const url = `https://steamcommunity.com/profiles/${steamId}/stats/${APP}/achievements/?xml=1`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { 'User-Agent': 'BOIPT-tracker' } });
  if (!res.ok) throw new SteamError(`Steam returned HTTP ${res.status}.`);
  const xml = await res.text();
  if (/<error>/.test(xml)) throw new SteamError('Steam profile not found or private.', 403);
  const privacy = xml.match(/<privacyState>([^<]*)</)?.[1] || 'unknown';
  const ids = [];
  for (const m of xml.matchAll(/<achievement closed="1">[\s\S]*?<apiname><!\[CDATA\[(\d+)\]\]><\/apiname>/g)) {
    ids.push(Number(m[1]));
  }
  return { source: 'xml', privacy, ids };
}

export async function steamAchievements(steamId) {
  if (!STEAM_ID.test(steamId || '')) throw new SteamError('First enter your SteamID64 under Sync → Steam.', 400);
  const hit = cache.get(steamId);
  if (hit && Date.now() - hit.at < TTL) return { ...hit.data, cached: true };
  const data = config.steamKey ? await viaApi(steamId) : await viaXml(steamId);
  data.count = data.ids.length;
  // 0 of 641 is almost always a privacy setting, not a new account.
  if (data.count === 0) {
    data.warning = 'Steam reports 0 achievements. Usually "Game details" is private: Steam → Edit Profile → Privacy Settings → Game details: Public.';
  }
  if (cache.size > 500) cache.clear();
  cache.set(steamId, { at: Date.now(), data });
  return data;
}
