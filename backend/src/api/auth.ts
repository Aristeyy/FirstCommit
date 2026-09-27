import { createHmac, timingSafeEqual } from 'node:crypto';

export interface MaxWebAppUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface ValidatedInitData {
  user: MaxWebAppUser;
  authDate: number;
  startParam: string | null;
}

export class AuthError extends Error {}

function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ab.length === bb.length && ab.length > 0 && timingSafeEqual(ab, bb);
}

function checkPairs(raw: string, botToken: string): Map<string, string> | null {
  const params = new URLSearchParams(raw);
  const keys = [...params.keys()];
  if (keys.length === 0 || keys.filter((k) => k === 'hash').length !== 1) return null;
  if (new Set(keys).size !== keys.length) return null; // дубликаты параметров не допускаем
  const hash = params.get('hash')!;
  const pairs = new Map([...params.entries()].filter(([k]) => k !== 'hash'));
  const dataCheckString = [...pairs.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calc = createHmac('sha256', secret).update(dataCheckString).digest('hex');
  return safeEqualHex(calc, hash) ? pairs : null;
}

/**
 * Проверка подписи initData мини-приложения MAX (HMAC-SHA256, ключ — производный от токена бота).
 * user.id из initDataUnsafe на клиенте не является доказательством личности — доверяем только этой проверке.
 */
export function validateInitData(initData: string, botToken: string, maxAgeSec: number, now = Date.now()): ValidatedInitData {
  if (!initData) throw new AuthError('Пустой initData');
  if (!botToken) throw new AuthError('Сервер не настроен: нет токена бота');
  // Клиент может передать строку как есть или дополнительно URL-кодированной — проверяем оба варианта.
  let pairs = checkPairs(initData, botToken);
  if (!pairs) {
    try {
      const decoded = decodeURIComponent(initData);
      if (decoded !== initData) pairs = checkPairs(decoded, botToken);
    } catch {
      /* некорректное кодирование */
    }
  }
  if (!pairs) throw new AuthError('Неверная подпись initData');

  const authDate = Number(pairs.get('auth_date'));
  if (!Number.isFinite(authDate)) throw new AuthError('Нет auth_date');
  const authMs = authDate > 1e12 ? authDate : authDate * 1000; // на случай миллисекунд
  const age = (now - authMs) / 1000;
  if (age > maxAgeSec || age < -300) throw new AuthError('initData устарел');

  let user: MaxWebAppUser;
  try {
    user = JSON.parse(pairs.get('user') ?? '');
  } catch {
    throw new AuthError('Некорректный user в initData');
  }
  if (!user || typeof user.id !== 'number') throw new AuthError('Нет user.id');
  return { user, authDate, startParam: pairs.get('start_param') ?? null };
}

/** Короткоживущий токен сессии мини-приложения: `userId.expires.hmac`. Хранится только в памяти клиента. */
export function signSession(userId: number, secret: string, ttlHours: number, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + Math.round(ttlHours * 3600);
  const body = `${userId}.${exp}`;
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifySession(token: string, secret: string, now = Date.now()): number {
  const parts = token.split('.');
  if (parts.length !== 3) throw new AuthError('Некорректный токен');
  const [uid, exp, sig] = parts;
  const expected = createHmac('sha256', secret).update(`${uid}.${exp}`).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new AuthError('Неверная подпись токена');
  if (Number(exp) * 1000 < now) throw new AuthError('Сессия истекла');
  const id = Number(uid);
  if (!Number.isSafeInteger(id)) throw new AuthError('Некорректный пользователь');
  return id;
}
