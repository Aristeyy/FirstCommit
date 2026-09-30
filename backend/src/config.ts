import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL обязателен'),

  MAX_BOT_TOKEN: z.string().default(''),
  MAX_API_BASE: z.string().url().default('https://platform-api2.max.ru'),
  MAX_BOT_USERNAME: z.string().default(''),

  API_PORT: z.coerce.number().int().default(3000),
  SESSION_SECRET: z.string().default(''),
  SESSION_TTL_HOURS: z.coerce.number().default(24),
  INIT_DATA_MAX_AGE_SEC: z.coerce.number().default(86400),
  ALLOW_DEV_AUTH: bool,

  DATA_MODE: z.enum(['live', 'offline']).default('live'),
  PARSER_INTERVAL_MIN: z.coerce.number().int().min(15).default(360),
  NOTIFY_INTERVAL_MIN: z.coerce.number().int().min(1).default(30),
  HTTP_USER_AGENT: z
    .string()
    .default('FirstCommitBot/1.0 (+https://github.com/Aristeyy/FirstCommit)'),
});

export type Config = z.infer<typeof schema>;

let cached: Config | null = null;

export function config(): Config {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Некорректные переменные окружения: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function sessionSecret(): string {
  const c = config();
  if (c.SESSION_SECRET) return c.SESSION_SECRET;
  if (c.MAX_BOT_TOKEN) return `session:${c.MAX_BOT_TOKEN}`;
  if (c.ALLOW_DEV_AUTH) return 'dev-only-insecure-secret';
  throw new Error('Не задан ни SESSION_SECRET, ни MAX_BOT_TOKEN');
}
