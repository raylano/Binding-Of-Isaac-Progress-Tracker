import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { config, ROOT } from './config.js';
import { authenticate, requireAuth, sameOrigin, pinMatches, setSessionCookie, clearSessionCookie } from './auth.js';
import { createUser, findUserByEmail, updateUser, createSession, listSessions, revokeSession, AccountExists } from './accounts.js';
import { normalizeEmail, emailProblem, passwordProblem, hashPassword, verifyPassword, burnPasswordCheck } from './passwords.js';
import { readProgress, updateProgress, sanitize, legacyAvailable, claimLegacy, ClaimError } from './store.js';
import { steamAchievements, SteamError, STEAM_ID } from './steam.js';
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

  // Foute wachtwoorden: 5 per 15 minuten per IP. Bewust geen harde grens per
  // account: die laat een vreemde de eigenaar buitensluiten (zie README).
  // Daarnaast hoogstens 30 pogingen per IP per kwartier, ook geslaagde: elke
  // poging kost een scrypt-berekening.
  const failed = (req, res) => res.statusCode < 400 || res.statusCode === 400 || res.statusCode === 409;
  const loginIpLimiter = limiter(15 * 60_000, 5, {
    skipSuccessfulRequests: true,
    requestWasSuccessful: failed,
    message: { error: 'Te veel foute pogingen. Wacht een kwartier.' },
  });
  const loginAttemptLimiter = limiter(15 * 60_000, 30, { message: { error: 'Te veel inlogpogingen. Wacht een kwartier.' } });
  // Nieuwe accounts: 10 pogingen per uur per IP.
  const registerLimiter = limiter(60 * 60_000, 10, { message: { error: 'Te veel nieuwe accounts vanaf dit adres. Probeer het later.' } });
  // De oude PIN is kort: per IP 5 fouten per kwartier, en voor iedereen samen
  // hoogstens 20 per uur. Liever even geen claim mogelijk dan een geraden PIN.
  const pinFailed = (req, res) => res.statusCode !== 403;
  const claimIpLimiter = limiter(15 * 60_000, 5, { skipSuccessfulRequests: true, requestWasSuccessful: pinFailed, message: { error: 'Te veel foute PINs. Wacht een kwartier.' } });
  const claimGlobalLimiter = limiter(60 * 60_000, 20, {
    skipSuccessfulRequests: true,
    requestWasSuccessful: pinFailed,
    keyGenerator: () => 'legacy-claim',
    message: { error: 'Te veel foute PINs. Probeer het over een uur opnieuw.' },
  });
  // Onbekende bearer-tokens: niet te raden (256 bits), maar ook niet gratis.
  const bearerLimiter = limiter(15 * 60_000, 20, { skipSuccessfulRequests: true, requestWasSuccessful: (req, res) => res.statusCode !== 401 });
  const json = express.json({ limit: '2kb' });

  const api = express.Router();
  api.use(limiter(60_000, 120));
  api.use(sameOrigin);

  api.get('/health', (req, res) => res.json({ ok: true }));

  api.get('/session', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const found = authenticate(req);
    if (!found) return res.json({ authed: false });
    res.json({ authed: true, user: { email: found.user.email }, legacy: { available: legacyAvailable() } });
  });

  // Gemeenschappelijk voor registreren, inloggen en sync-token: velden lezen en
  // controleren. Geeft null terug als er al een antwoord is gestuurd.
  function credentials(req, res) {
    const { email: rawEmail, password } = req.body || {};
    if (typeof rawEmail !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Vul je e-mailadres en wachtwoord in.' });
      return null;
    }
    return { email: normalizeEmail(rawEmail), password };
  }

  async function checkPassword(email, password) {
    const user = findUserByEmail(email);
    if (!user) return burnPasswordCheck(password);
    return (await verifyPassword(password, user.passwordHash)) ? user : null;
  }

  const userAgent = (req) => req.headers['user-agent'] || '';
  const BAD_LOGIN = { error: 'Onbekend e-mailadres of verkeerd wachtwoord.' };

  api.post('/register', registerLimiter, json, async (req, res) => {
    const cred = credentials(req, res);
    if (!cred) return;
    const problem = emailProblem(cred.email) || passwordProblem(cred.password, cred.email);
    if (problem) return res.status(400).json({ error: problem });
    if (findUserByEmail(cred.email)) return res.status(409).json({ error: 'Er bestaat al een account met dit e-mailadres. Log in.' });
    let user;
    try {
      user = await createUser(cred.email, await hashPassword(cred.password));
    } catch (err) {
      if (err instanceof AccountExists) return res.status(409).json({ error: 'Er bestaat al een account met dit e-mailadres. Log in.' });
      throw err;
    }
    const { token } = await createSession(user, { kind: 'browser', userAgent: userAgent(req) });
    setSessionCookie(req, res, token);
    res.status(201).json({ ok: true, user: { email: user.email } });
  });

  api.post('/login', loginAttemptLimiter, loginIpLimiter, json, async (req, res) => {
    const cred = credentials(req, res);
    if (!cred) return;
    const user = await checkPassword(cred.email, cred.password);
    if (!user) return res.status(401).json(BAD_LOGIN);
    // Altijd een nieuw token: een vooraf geplante cookie wordt nooit hergebruikt.
    const { token } = await createSession(user, { kind: 'browser', userAgent: userAgent(req) });
    setSessionCookie(req, res, token);
    res.json({ ok: true, user: { email: user.email } });
  });

  // Token voor tools/sync-save.ps1. Geen cookie; het script bewaart het token
  // versleuteld (DPAPI) en kan het via het sessie-overzicht kwijtraken.
  api.post('/token', loginAttemptLimiter, loginIpLimiter, json, async (req, res) => {
    const cred = credentials(req, res);
    if (!cred) return;
    const user = await checkPassword(cred.email, cred.password);
    if (!user) return res.status(401).json(BAD_LOGIN);
    const label = typeof req.body.label === 'string' ? req.body.label.replace(/[^\p{L}\p{N} ._-]/gu, '').trim() : '';
    const { token, session } = await createSession(user, { kind: 'sync', label: label || 'sync-script', userAgent: userAgent(req) });
    res.status(201).json({ token, expiresAt: new Date(session.expiresAt).toISOString(), user: { email: user.email } });
  });

  api.post('/logout', async (req, res) => {
    const found = authenticate(req);
    if (found) await revokeSession(found.user.id, found.session.id);
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  api.use((req, res, next) => (req.headers.authorization ? bearerLimiter(req, res, next) : next()), requireAuth);

  api.get('/sessions', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      sessions: listSessions(req.user.id).map((s) => ({
        id: s.id,
        kind: s.kind,
        label: s.label,
        userAgent: s.userAgent,
        createdAt: new Date(s.createdAt).toISOString(),
        lastSeen: new Date(s.lastSeen).toISOString(),
        expiresAt: new Date(s.expiresAt).toISOString(),
        current: s.id === req.session.id,
      })),
    });
  });

  api.delete('/sessions/:id', async (req, res) => {
    if (!/^[a-f0-9]{16}$/.test(req.params.id) || !(await revokeSession(req.user.id, req.params.id))) {
      return res.status(404).json({ error: 'Sessie niet gevonden.' });
    }
    res.json({ ok: true });
  });

  api.post('/legacy/claim', claimGlobalLimiter, claimIpLimiter, json, async (req, res) => {
    if (!pinMatches(req.body?.pin)) return res.status(403).json({ error: 'Verkeerde PIN.' });
    try {
      const saved = await claimLegacy(req.user.id, MAX_ID);
      // De STEAM_ID uit .env hoorde bij de oude eigenaar.
      if (!req.user.steamId && STEAM_ID.test(config.steamId)) await updateUser(req.user.id, { steamId: config.steamId });
      res.json({ ok: true, progress: saved });
    } catch (err) {
      if (err instanceof ClaimError) return res.status(409).json({ error: err.message });
      throw err;
    }
  });

  const accountId = (steamId) => (steamId ? String(BigInt(steamId) - 76561197960265728n) : null);

  api.get('/config', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const steamId = req.user.steamId || null;
    res.json({
      email: req.user.email,
      steamId,
      steamKey: Boolean(config.steamKey),
      // Steam bewaart saves onder userdata/<account-ID>; dat is SteamID64 min de basis.
      accountId: accountId(steamId),
    });
  });

  api.put('/account', json, async (req, res) => {
    const raw = req.body?.steamId;
    const steamId = raw === null || raw === '' ? null : String(raw ?? '').trim();
    if (steamId !== null && !STEAM_ID.test(steamId)) return res.status(400).json({ error: 'Een SteamID64 is 17 cijfers en begint met 7656119.' });
    await updateUser(req.user.id, { steamId });
    res.json({ ok: true, steamId, accountId: accountId(steamId) });
  });

  api.get('/progress', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json((await readProgress(req.user.id)) || { version: 1, updatedAt: null });
  });

  api.put('/progress', limiter(60_000, 60), express.json({ limit: '256kb' }), async (req, res) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || !body.state || typeof body.state !== 'object') return res.status(400).json({ error: 'Geen voortgang meegestuurd.' });
    // Optimistische vergrendeling: is de server intussen nieuwer (ander apparaat),
    // dan krijgt de client de nieuwe stand terug in plaats van die te overschrijven.
    let conflict = null;
    const { saved } = await updateProgress(req.user.id, (current) => {
      if (current?.updatedAt && body.base !== undefined && body.base !== current.updatedAt) {
        conflict = current;
        return undefined;
      }
      return sanitize(body.state, MAX_ID);
    });
    if (conflict) return res.status(409).json({ error: 'Er is intussen op een ander apparaat iets veranderd.', current: conflict });
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
    let gained;
    const { saved } = await updateProgress(req.user.id, (current) => {
      const state = normalizeState(current || {});
      gained = applySave(model, state, save, { keepManual: [...state.manual] });
      return state;
    });
    res.json({ ok: true, edition: save.edition, achievements: save.achievements.length, gained, updatedAt: saved.updatedAt });
  });

  api.get('/steam', limiter(60_000, 6), async (req, res) => {
    try {
      const data = { ...(await steamAchievements(req.user.steamId)) };
      if (req.query.apply === '1') {
        const { saved } = await updateProgress(req.user.id, (current) => {
          const state = normalizeState(current || {});
          data.gained = applySteam(model, state, data.ids);
          return state;
        });
        data.updatedAt = saved.updatedAt;
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
