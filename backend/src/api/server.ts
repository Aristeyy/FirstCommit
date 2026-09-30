import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { z } from 'zod';
import { config, sessionSecret } from '../config';
import { db } from '../db/pool';
import * as repo from '../db/repo';
import { search, toView } from '../domain/catalog';
import type { Profile } from '../domain/match';
import { DIRECTIONS, DIRECTION_IDS, FORMATS, QUICK_CITIES, STACK_IDS } from '../domain/taxonomy';
import { log } from '../log';
import { AuthError, signSession, validateInitData, verifySession } from './auth';
import { RateLimiter } from './rate-limit';

const DEV_USER_ID = 1_000_001;

declare module 'fastify' {
  interface FastifyRequest {
    userId: number;
  }
}

export function profileOf(u: repo.UserRow): Profile {
  return {
    directions: u.directions,
    stack: u.stack,
    course: u.course,
    city: u.city,
    formats: u.formats,
    paid_only: u.paid_only,
  };
}

function publicProfile(u: repo.UserRow) {
  return { ...profileOf(u), notify: u.notify, first_name: u.first_name, onboarded: !!u.onboarded_at };
}

const list = (max = 20) =>
  z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean).slice(0, max) : undefined));

const searchQuery = z.object({
  q: z.string().max(100).optional(),
  directions: list(),
  stack: list(),
  formats: list(3),
  city: z.string().max(60).optional(),
  paid_only: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
  fit_course: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
  status: z.enum(['active', 'open', 'soon', 'all']).optional(),
  kind: z.enum(['program', 'vacancy', 'all']).optional(),
  sort: z.enum(['match', 'deadline', 'new']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const profileBody = z
  .object({
    directions: z.array(z.enum(DIRECTION_IDS as [string, ...string[]])).max(14),
    stack: z.array(z.enum(STACK_IDS as [string, ...string[]])).max(30),
    course: z.number().int().min(1).max(7).nullable(),
    city: z.string().trim().max(60).nullable(),
    formats: z.array(z.enum(['remote', 'hybrid', 'office'])).max(3),
    paid_only: z.boolean(),
    notify: z.boolean(),
  })
  .partial();

function sendError(reply: FastifyReply, status: number, code: string, message: string) {
  return reply.code(status).send({ error: { code, message } });
}

export async function buildServer() {
  const app = Fastify({ logger: false, bodyLimit: 64 * 1024, trustProxy: true });
  const cfg = config();

  app.setErrorHandler((err: Error & { statusCode?: number; issues?: unknown }, req, reply) => {
    if (err instanceof z.ZodError) return sendError(reply, 400, 'validation', 'Некорректные параметры запроса');
    if (err instanceof AuthError) return sendError(reply, 401, 'unauthorized', err.message);
    if (err.statusCode && err.statusCode < 500) return sendError(reply, err.statusCode, 'bad_request', err.message);
    log.error(`Ошибка ${req.method} ${req.url}`, err);
    return sendError(reply, 500, 'internal', 'Внутренняя ошибка сервера. Попробуйте ещё раз.');
  });

  const authLimiter = new RateLimiter(20, 60_000);
  const apiLimiter = new RateLimiter(180, 60_000);
  app.addHook('onRequest', async (req, reply) => {
    if (req.url.startsWith('/api/health')) return;
    const limiter = req.url.startsWith('/api/auth') ? authLimiter : apiLimiter;
    if (!limiter.take(req.ip)) {
      reply.header('Retry-After', String(limiter.retryAfterSec(req.ip)));
      return sendError(reply, 429, 'rate_limited', 'Слишком много запросов. Подождите немного и попробуйте снова.');
    }
  });

  app.get('/api/health', async () => {
    await db().query('SELECT 1');
    return { ok: true };
  });

  app.post('/api/auth', async (req) => {
    const body = z.object({ initData: z.string().max(4096).optional(), dev: z.boolean().optional() }).parse(req.body ?? {});
    let userId: number;
    let firstName: string | null = null;
    let startParam: string | null = null;
    if (body.initData) {
      const v = validateInitData(body.initData, cfg.MAX_BOT_TOKEN, cfg.INIT_DATA_MAX_AGE_SEC);
      userId = v.user.id;
      firstName = v.user.first_name ?? null;
      startParam = v.startParam;
    } else if (body.dev && cfg.ALLOW_DEV_AUTH) {
      userId = DEV_USER_ID;
      firstName = 'Демо';
    } else {
      throw new AuthError('Откройте приложение из чат-бота в MAX');
    }
    const user = await repo.ensureUser(userId, firstName);
    return {
      token: signSession(userId, sessionSecret(), cfg.SESSION_TTL_HOURS),
      expires_in: cfg.SESSION_TTL_HOURS * 3600,
      start_param: startParam,
      profile: publicProfile(user),
      dev: !body.initData,
    };
  });

  app.get('/api/meta', async () => {
    const [sources, cities] = await Promise.all([repo.listSources(), repo.listCities()]);
    return {
      directions: DIRECTIONS,
      formats: FORMATS,
      stack: STACK_IDS,
      cities: [...new Set([...QUICK_CITIES, ...cities])],
      sources: sources.map((s) => ({
        id: s.id,
        name: s.name,
        kind: s.kind,
        url: s.url,
        items: s.items_count,
        updated_at: s.last_success_at,
        mode: s.mode,
        ok: !s.last_error,
      })),
    };
  });

  app.register(async (priv) => {
    priv.addHook('preHandler', async (req: FastifyRequest) => {
      const h = req.headers.authorization ?? '';
      const token = h.startsWith('Bearer ') ? h.slice(7) : '';
      if (!token) throw new AuthError('Требуется авторизация');
      req.userId = verifySession(token, sessionSecret());
    });

    const loadUser = async (id: number) => (await repo.getUser(id)) ?? (await repo.ensureUser(id));

    priv.get('/api/profile', async (req) => publicProfile(await loadUser(req.userId)));

    priv.put('/api/profile', async (req) => {
      const patch = profileBody.parse(req.body ?? {});
      await loadUser(req.userId);
      const user = await repo.updateUser(req.userId, { ...patch, onboarded: true, onboarding_step: null });
      return publicProfile(user);
    });

    priv.get('/api/internships', async (req) => {
      const f = searchQuery.parse(req.query);
      const [user, rows, tracked] = await Promise.all([
        loadUser(req.userId),
        repo.listActiveInternships(),
        repo.trackedIds(req.userId),
      ]);
      return search(rows, profileOf(user), tracked, f);
    });

    priv.get('/api/internships/:id', async (req, reply) => {
      const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
      const row = await repo.getInternship(id);
      if (!row) return sendError(reply, 404, 'not_found', 'Стажировка не найдена или снята с публикации');
      const [user, tracked] = await Promise.all([loadUser(req.userId), repo.trackedIds(req.userId)]);
      return { ...toView(row, profileOf(user), tracked), active: row.active };
    });

    priv.put('/api/internships/:id/track', async (req, reply) => {
      const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
      const { on } = z.object({ on: z.boolean() }).parse(req.body ?? {});
      if (!(await repo.getInternship(id))) return sendError(reply, 404, 'not_found', 'Стажировка не найдена');
      await loadUser(req.userId);
      await repo.setTracked(req.userId, id, on);
      return { id, tracked: on };
    });

    priv.get('/api/tracked', async (req) => {
      const [user, rows] = await Promise.all([loadUser(req.userId), repo.listTracked(req.userId)]);
      const ids = new Set(rows.map((r) => r.id));
      return { items: rows.map((r) => ({ ...toView(r, profileOf(user), ids), active: r.active })) };
    });
  });

  app.setNotFoundHandler((_req, reply) => sendError(reply, 404, 'not_found', 'Метод не найден'));
  return app;
}
