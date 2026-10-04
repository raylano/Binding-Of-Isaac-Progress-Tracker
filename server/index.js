import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { config, ROOT } from './config.js';
import { pinMatches, isAuthed, requireAuth, setSessionCookie, clearSessionCookie } from './auth.js';
import { readProgress, writeProgress, sanitize } from './store.js';
import { steamAchievements, SteamError } from './steam.js';
import { parseSave, SaveError } from '../web/js/save-parser.js';
import { buildModel, applySave, applySteam, normalizeState } from '../web/js/logic.js';

const WEB = path.join(ROOT, 'web');
const achievements = JSON.parse(fs.readFileSync(path.join(WEB, 'data', 'achievements.json'), 'utf8'));
const model = buildModel(achievements);
const MAX_ID = achievements.length;

const limiter = (windowMs, limit, extra = {}) => rateLimit({
  windowMs,
  limit,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Rustig aan: te veel verzoeken. Probeer het zo opnieuw.' },
  ...extra,
});

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://*.steamstatic.com https://steamcdn-a.akamaihd.net",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; '));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    next();
  });

  // Inloggen en elk verzoek met een PIN in de header: 5 mislukte pogingen per
  // 15 minuten per IP. Geslaagde pogingen tellen niet mee.
  const authLimiter = limiter(15 * 60_000, 5, {
    skipSuccessfulRequests: true,
    // Alleen een foute PIN telt; een goede PIN met een kapot bestand niet.
    requestWasSuccessful: (req, res) => res.statusCode !== 401,
    message: { error: 'Te veel foute pogingen. Wacht een kwartier.' },
  });
  const bearerLimiter = (req, res, next) => (req.headers.authorization ? authLimiter(req, res, next) : next());

  const api = express.Router();
  api.use(limiter(60_000, 120));

  api.get('/health', (req, res) => res.json({ ok: true }));

  api.get('/session', (req, res) => res.json({ authed: isAuthed(req), configured: Boolean(config.pin), pinLength: config.pin.length }));

  api.post('/login', authLimiter, express.json({ limit: '1kb' }), (req, res) => {
    if (!pinMatches(req.body?.pin)) return res.status(401).json({ error: 'Verkeerde PIN.' });
    setSessionCookie(req, res);
    res.json({ ok: true });
  });

  api.post('/logout', (req, res) => {
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  api.use(bearerLimiter, requireAuth);

  // Alleen na inloggen: persoonlijke gegevens horen niet in de publieke bestanden.
  api.get('/config', (req, res) => {
    const id = /^\d{17}$/.test(config.steamId) ? BigInt(config.steamId) : null;
    res.json({
      steamId: config.steamId || null,
      steamKey: Boolean(config.steamKey),
      // Steam bewaart saves onder userdata/<account-ID>; dat is SteamID64 min de basis.
      accountId: id ? String(id - 76561197960265728n) : null,
    });
  });

  api.get('/progress', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json((await readProgress()) || { version: 1, updatedAt: null });
  });

  api.put('/progress', limiter(60_000, 60), express.json({ limit: '256kb' }), async (req, res) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || !body.state) return res.status(400).json({ error: 'Geen voortgang meegestuurd.' });
    // Optimistische vergrendeling: is de server intussen nieuwer (ander apparaat),
    // dan krijgt de client de nieuwe stand terug in plaats van die te overschrijven.
    const current = await readProgress();
    if (current?.updatedAt && body.base !== undefined && body.base !== current.updatedAt) {
      return res.status(409).json({ error: 'Er is intussen op een ander apparaat iets veranderd.', current });
    }
    const saved = await writeProgress(sanitize(body.state, MAX_ID));
    res.json(saved);
  });

  // Ruwe save-upload (voor tools/sync-save.ps1). De save is leidend; handmatige
  // vinkjes blijven staan zodat er nooit stilletjes iets verdwijnt.
  api.post('/save', limiter(60_000, 20), express.raw({ type: () => true, limit: '64kb' }), async (req, res) => {
    let save;
    try {
      save = parseSave(req.body);
    } catch (err) {
      if (err instanceof SaveError) return res.status(400).json({ error: err.message });
      throw err;
    }
    const state = normalizeState((await readProgress()) || {});
    const gained = applySave(model, state, save, { keepManual: [...state.manual] });
    const saved = await writeProgress(state);
    res.json({ ok: true, edition: save.edition, achievements: save.achievements.length, gained, updatedAt: saved.updatedAt });
  });

  api.get('/steam', limiter(60_000, 6), async (req, res) => {
    try {
      const data = await steamAchievements();
      if (req.query.apply === '1') {
        const state = normalizeState((await readProgress()) || {});
        data.gained = applySteam(model, state, data.ids);
        data.updatedAt = (await writeProgress(state)).updatedAt;
      }
      res.json(data);
    } catch (err) {
      if (err instanceof SteamError) return res.status(err.status).json({ error: err.message });
      res.status(502).json({ error: 'Steam is niet bereikbaar.' });
    }
  });

  api.use((req, res) => res.status(404).json({ error: 'Onbekend endpoint.' }));

  app.use('/api', api);

  app.use(limiter(60_000, 300));
  app.use(express.static(WEB, {
    index: 'index.html',
    setHeaders(res, file) {
      if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
      else if (/\.(woff2|png|svg|jpg)$/.test(file)) res.setHeader('Cache-Control', 'public, max-age=604800');
      else res.setHeader('Cache-Control', 'no-cache');
    },
  }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Te groot.' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Ongeldige JSON.' });
    console.error(err);
    res.status(500).json({ error: 'Er ging iets mis op de server.' });
  });

  return app;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.join(ROOT, 'server', 'index.js')) {
  createApp().listen(config.port, config.host, () => {
    console.log(`BOIPT draait op http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`);
  });
}
