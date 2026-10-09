import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { config, ROOT } from './config.js';
import { authenticate, requireAuth, sameOrigin, setSessionCookie, clearSessionCookie } from './auth.js';
import { createUser, findUserByEmail, updateUser, createSession, listSessions, revokeSession, AccountExists } from './accounts.js';
import { normalizeEmail, emailProblem, passwordProblem, hashPassword, verifyPassword, burnPasswordCheck } from './passwords.js';
import { readProgress, updateProgress, sanitize } from './store.js';
import { steamAchievements, SteamError, STEAM_ID } from './steam.js';
import { getSettings, updateSettings, isAdmin, bootstrapAdmin } from './admin.js';
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
  message: { error: 'Slow down: too many requests. Try again shortly.' },
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

  // Wrong passwords: 5 per 15 minutes per IP. Deliberately no hard limit per
  // account: that would let a stranger lock the owner out (see README).
  // On top of that at most 30 attempts per IP per 15 minutes, successful ones
  // included: every attempt costs a scrypt computation.
  const failed = (req, res) => res.statusCode < 400 || res.statusCode === 400 || res.statusCode === 409;
  const loginIpLimiter = limiter(15 * 60_000, 5, {
    skipSuccessfulRequests: true,
    requestWasSuccessful: failed,
    message: { error: 'Too many failed attempts. Wait 15 minutes.' },
  });
  const loginAttemptLimiter = limiter(15 * 60_000, 30, { message: { error: 'Too many login attempts. Wait 15 minutes.' } });
  // Registration: 10 attempts per hour per IP, counted even while registration is closed.
  const registerLimiter = limiter(60 * 60_000, 10, { message: { error: 'Too many sign-up attempts from this address. Try again later.' } });
  // Unknown bearer tokens: impossible to guess (256 bits), but not free either.
  const bearerLimiter = limiter(15 * 60_000, 20, { skipSuccessfulRequests: true, requestWasSuccessful: (req, res) => res.statusCode !== 401 });
  const json = express.json({ limit: '2kb' });

  const api = express.Router();
  api.use(limiter(60_000, 120));
  api.use(sameOrigin);

  api.get('/health', (req, res) => res.json({ ok: true }));

  api.get('/session', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const found = authenticate(req);
    const { registrationOpen } = getSettings();
    if (!found) return res.json({ authed: false, registrationOpen });
    res.json({ authed: true, user: { email: found.user.email, admin: isAdmin(found.user) }, registrationOpen });
  });

  // Shared by register, login and sync token: read and check the fields.
  // Returns null if a response has already been sent.
  function credentials(req, res) {
    const { email: rawEmail, password } = req.body || {};
    if (typeof rawEmail !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Enter your email address and password.' });
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
  const BAD_LOGIN = { error: 'Unknown email address or wrong password.' };
  const CLOSED = { error: 'New accounts are currently not being accepted.' };
  const EXISTS = { error: 'An account with this email address already exists. Log in instead.' };

  api.post('/register', registerLimiter, json, async (req, res) => {
    // Checked before anything else (and before hashing): closed means closed.
    if (!getSettings().registrationOpen) return res.status(403).json(CLOSED);
    const cred = credentials(req, res);
    if (!cred) return;
    // The admin address is created by bootstrapAdmin only, never via sign-up.
    if (config.adminEmail && cred.email === config.adminEmail) return res.status(403).json(CLOSED);
    const problem = emailProblem(cred.email) || passwordProblem(cred.password, cred.email);
    if (problem) return res.status(400).json({ error: problem });
    if (findUserByEmail(cred.email)) return res.status(409).json(EXISTS);
    let user;
    try {
      user = await createUser(cred.email, await hashPassword(cred.password));
    } catch (err) {
      if (err instanceof AccountExists) return res.status(409).json(EXISTS);
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
    // Always a new token: a pre-planted cookie is never reused.
    const { token } = await createSession(user, { kind: 'browser', userAgent: userAgent(req) });
    setSessionCookie(req, res, token);
    res.json({ ok: true, user: { email: user.email } });
  });

  // Token for tools/sync-save.ps1. No cookie; the script stores the token
  // encrypted (DPAPI) and it can be revoked from the session list.
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
      return res.status(404).json({ error: 'Session not found.' });
    }
    res.json({ ok: true });
  });

  // Admin only, and only from a browser session: a sync token can upload saves
  // but never change site settings.
  function requireAdmin(req, res, next) {
    if (req.session.kind !== 'browser' || !isAdmin(req.user)) return res.status(403).json({ error: 'Admins only.' });
    next();
  }

  api.get('/admin/settings', requireAdmin, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(getSettings());
  });

  api.put('/admin/settings', requireAdmin, json, async (req, res) => {
    const open = req.body?.registrationOpen;
    if (typeof open !== 'boolean') return res.status(400).json({ error: 'registrationOpen must be true or false.' });
    const saved = await updateSettings({ registrationOpen: open });
    console.log(`Registration ${open ? 'opened' : 'closed'} by the admin.`);
    res.json(saved);
  });

  const accountId = (steamId) => (steamId ? String(BigInt(steamId) - 76561197960265728n) : null);

  api.get('/config', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const steamId = req.user.steamId || null;
    res.json({
      email: req.user.email,
      steamId,
      steamKey: Boolean(config.steamKey),
      // Public address for the sync-script command; the page falls back to its own origin.
      publicUrl: config.publicUrl || null,
      // Steam stores saves under userdata/<account ID>, which is SteamID64 minus the base.
      accountId: accountId(steamId),
    });
  });

  api.put('/account', json, async (req, res) => {
    const raw = req.body?.steamId;
    const steamId = raw === null || raw === '' ? null : String(raw ?? '').trim();
    if (steamId !== null && !STEAM_ID.test(steamId)) return res.status(400).json({ error: 'A SteamID64 is 17 digits and starts with 7656119.' });
    await updateUser(req.user.id, { steamId });
    res.json({ ok: true, steamId, accountId: accountId(steamId) });
  });

  api.get('/progress', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json((await readProgress(req.user.id)) || { version: 1, updatedAt: null });
  });

  api.put('/progress', limiter(60_000, 60), express.json({ limit: '256kb' }), async (req, res) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || !body.state || typeof body.state !== 'object') return res.status(400).json({ error: 'No progress was sent.' });
    // Optimistic locking: if the server is newer (another device), the client
    // gets the newer state back instead of overwriting it.
    let conflict = null;
    const { saved } = await updateProgress(req.user.id, (current) => {
      if (current?.updatedAt && body.base !== undefined && body.base !== current.updatedAt) {
        conflict = current;
        return undefined;
      }
      return sanitize(body.state, MAX_ID);
    });
    if (conflict) return res.status(409).json({ error: 'Something changed on another device in the meantime.', current: conflict });
    res.json(saved);
  });

  // Raw save upload (for tools/sync-save.ps1). The save is authoritative; manual
  // ticks stay so nothing silently disappears.
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
      res.status(502).json({ error: 'Steam is unreachable.' });
    }
  });

  api.use((req, res) => res.status(404).json({ error: 'Unknown endpoint.' }));

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
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Too large.' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on the server.' });
  });

  return app;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.join(ROOT, 'server', 'index.js')) {
  // The admin account must exist before anyone can reach the sign-up route.
  await bootstrapAdmin();
  createApp().listen(config.port, config.host, () => {
    console.log(`BasementDiary is running on http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`);
  });
}
