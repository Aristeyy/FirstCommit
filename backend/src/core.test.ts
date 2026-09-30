import { strict as assert } from 'node:assert';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { AuthError, signSession, validateInitData, verifySession } from './api/auth';
import { RateLimiter } from './api/rate-limit';
import { matchScore, recruitmentStatus } from './domain/match';
import { classifyDirection, extractStack, looksLikeIT } from './domain/taxonomy';
import { habrAdapter } from './parsers/habr';
import { trudvsemAdapter } from './parsers/trudvsem';

process.env.DATABASE_URL ||= 'postgres://unused';
const TOKEN = 'test-bot-token';

function makeInitData(fields: Record<string, string>, token = TOKEN): string {
  const dcs = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret).update(dcs).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

const now = Math.floor(Date.now() / 1000);
const baseFields = { auth_date: String(now), query_id: 'q1', user: JSON.stringify({ id: 42, first_name: 'Аня' }), start_param: 'i15' };

test('initData: корректная подпись принимается, start_param читается', () => {
  const v = validateInitData(makeInitData(baseFields), TOKEN, 3600);
  assert.equal(v.user.id, 42);
  assert.equal(v.startParam, 'i15');
});

test('initData: дополнительно URL-кодированная строка тоже принимается', () => {
  const v = validateInitData(encodeURIComponent(makeInitData(baseFields)), TOKEN, 3600);
  assert.equal(v.user.id, 42);
});

test('initData: подделка user отклоняется', () => {
  const raw = makeInitData(baseFields).replace('42', '43');
  assert.throws(() => validateInitData(raw, TOKEN, 3600), AuthError);
});

test('initData: чужой токен и устаревшая подпись отклоняются', () => {
  assert.throws(() => validateInitData(makeInitData(baseFields, 'other'), TOKEN, 3600), AuthError);
  const old = makeInitData({ ...baseFields, auth_date: String(now - 7200) });
  assert.throws(() => validateInitData(old, TOKEN, 3600), AuthError);
});

test('сессия: подпись и срок действия', () => {
  const t = signSession(7, 's', 1);
  assert.equal(verifySession(t, 's'), 7);
  assert.throws(() => verifySession(t, 'other'), AuthError);
  assert.throws(() => verifySession(signSession(7, 's', 1, Date.now() - 2 * 3600_000), 's'), AuthError);
});

test('классификация направлений (кириллица)', () => {
  assert.equal(classifyDirection('Системный аналитик'), 'analyst');
  assert.equal(classifyDirection('Программист-стажер 1С'), 'onec');
  assert.equal(classifyDirection('Стажёр-фронтенд разработчик'), 'frontend');
  assert.equal(classifyDirection('Функциональный тестировщик'), 'qa');
  assert.equal(classifyDirection('Стажер Data Science'), 'ml');
  assert.equal(classifyDirection('Юрисконсульт'), 'other');
  assert.equal(looksLikeIT('Юрисконсульт'), false);
});

test('стек: Go не путается со словами, 1С распознаётся', () => {
  assert.deepEqual(extractStack('Go, PostgreSQL, Docker'), ['Go', 'SQL', 'Docker']);
  assert.deepEqual(extractStack('Good communication'), []);
  assert.ok(extractStack('Разработка на 1С 8.3').includes('1С'));
});

test('скоринг объясним и учитывает курс', () => {
  const profile = { directions: ['backend'], stack: ['Go', 'SQL'], course: 2, city: 'Казань', formats: [], paid_only: false };
  const r = matchScore(profile, { direction: 'backend', stack: ['Go', 'SQL'], format: 'office', cities: ['Казань'], min_course: 2, paid: true });
  assert.equal(r.score, 100);
  assert.ok(r.reasons.some((x) => x.includes('Go')));
  const r2 = matchScore(profile, { direction: 'backend', stack: [], format: 'office', cities: ['Москва'], min_course: 3, paid: true });
  assert.ok(r2.warnings.some((w) => w.includes('3 курса')));
});

test('статус набора', () => {
  const d = (n: number) => new Date(Date.now() + n * 86_400_000);
  assert.equal(recruitmentStatus(d(-5), d(5)), 'open');
  assert.equal(recruitmentStatus(d(3), d(20)), 'soon');
  assert.equal(recruitmentStatus(d(-20), d(-1)), 'closed');
  assert.equal(recruitmentStatus(null, null), 'rolling');
});

test('парсеры разбирают сохранённые снимки источников', async () => {
  const habr = await habrAdapter.fetch('offline');
  const tv = await trudvsemAdapter.fetch('offline');
  assert.ok(habr.length > 5, `habr: ${habr.length}`);
  assert.ok(tv.length > 5, `trudvsem: ${tv.length}`);
  for (const i of [...habr, ...tv]) {
    assert.ok(i.title && i.apply_url.startsWith('https://'), i.title);
    assert.notEqual(i.company, '');
  }
});

test('ограничитель частоты: лимит в окне и сброс после окна', () => {
  const rl = new RateLimiter(2, 1000);
  assert.equal(rl.take('ip', 0), true);
  assert.equal(rl.take('ip', 10), true);
  assert.equal(rl.take('ip', 20), false);
  assert.equal(rl.take('other', 20), true);
  assert.equal(rl.take('ip', 1500), true);
});
