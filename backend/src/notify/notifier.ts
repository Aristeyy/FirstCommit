import { Bot, Keyboard, type Api } from '@maxhub/max-bot-api';
import { config } from '../config';
import { db } from '../db/pool';
import * as repo from '../db/repo';
import { search, toView } from '../domain/catalog';
import { profileOf } from '../api/server';
import { log } from '../log';
import { cardText, humanDate, openAppButton, plural } from '../bot/ui';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createNotifier() {
  const cfg = config();
  const api: Api = new Bot(cfg.MAX_BOT_TOKEN || 'missing', { clientOptions: { baseUrl: cfg.MAX_API_BASE } }).api;
  let botUsername = cfg.MAX_BOT_USERNAME;

  async function username(): Promise<string> {
    if (!botUsername) botUsername = (await api.getMyInfo()).username ?? '';
    return botUsername;
  }

  async function send(userId: number, text: string, buttons: Parameters<typeof Keyboard.inlineKeyboard>[0]) {
    await api.sendMessageToUser(userId, text, {
      format: 'html',
      attachments: buttons.length ? [Keyboard.inlineKeyboard(buttons)] : undefined,
    });
    await sleep(120);
  }

  async function deadlineReminders(): Promise<number> {
    const { rows } = await db().query<{ user_id: string; internship_id: number }>(
      `SELECT t.user_id, t.internship_id FROM tracked t
       JOIN users u ON u.max_user_id = t.user_id AND u.notify AND u.max_user_id <> 1000001
       JOIN internships i ON i.id = t.internship_id AND i.active
       WHERE i.deadline IS NOT NULL OR i.opens_at IS NOT NULL`,
    );
    const bot = await username();
    let sent = 0;
    for (const r of rows) {
      const userId = Number(r.user_id);
      const [user, row] = await Promise.all([repo.getUser(userId), repo.getInternship(r.internship_id)]);
      if (!user || !row) continue;
      const v = toView(row, profileOf(user), new Set([row.id]));
      let kind: string | null = null;
      let head = '';
      if (v.status === 'open' && v.days_left !== null && v.days_left <= 7) {
        kind = v.days_left <= 1 ? 'deadline_1' : v.days_left <= 3 ? 'deadline_3' : 'deadline_7';
        head =
          v.days_left === 0
            ? '🔥 <b>Сегодня последний день подачи!</b>'
            : `⏰ <b>До дедлайна ${v.days_left} ${plural(v.days_left, 'день', 'дня', 'дней')}</b> (до ${humanDate(v.deadline!)})`;
      } else if (v.status === 'open' && row.opens_at) {
        const opened = (Date.now() - new Date(`${row.opens_at}T00:00:00`).getTime()) / 86_400_000;
        if (opened >= 0 && opened < 3) {
          kind = 'opened';
          head = '🟢 <b>Набор открылся!</b>';
        }
      }
      if (!kind) continue;
      if (!(await repo.markNotified(userId, row.id, kind))) continue;
      try {
        await send(userId, `${head}\n\n${cardText(v)}`, [
          [Keyboard.button.link('📝 Подать заявку', v.apply_url)],
          [openAppButton('Открыть карточку', bot, `i${v.id}`) as never, Keyboard.button.callback('Не отслеживать', `track:${v.id}`)],
        ]);
        sent++;
      } catch (e) {
        log.warn(`Не удалось отправить напоминание пользователю ${userId}`, e instanceof Error ? e.message : e);
      }
    }
    return sent;
  }

  async function digests(): Promise<number> {
    const { rows: users } = await db().query(
      `SELECT max_user_id FROM users WHERE notify AND onboarded_at IS NOT NULL AND max_user_id <> 1000001
         AND (last_digest_at IS NULL OR last_digest_at < now() - interval '24 hours')`,
    );
    if (users.length === 0) return 0;
    const all = await repo.listActiveInternships();
    const bot = await username();
    let sent = 0;
    for (const { max_user_id } of users) {
      const user = await repo.getUser(Number(max_user_id));
      if (!user) continue;
      const since = (user.last_digest_at ?? user.onboarded_at!).getTime();
      const fresh = all.filter((r) => new Date(r.first_seen_at).getTime() > since);
      await db().query('UPDATE users SET last_digest_at = now() WHERE max_user_id = $1', [user.max_user_id]);
      if (fresh.length === 0) continue;
      const tracked = await repo.trackedIds(user.max_user_id);
      const res = search(fresh, profileOf(user), tracked, { status: 'active', fit_course: true, limit: 3 });
      const good = res.items.filter((v) => v.match.score >= 60);
      if (good.length === 0) continue;
      const text = [
        `✨ <b>${good.length} ${plural(good.length, 'новая стажировка', 'новые стажировки', 'новых стажировок')} под твой профиль</b>`,
        '',
        ...good.map((v, i) => `${cardText(v, i + 1)}\n`),
      ].join('\n');
      try {
        await send(user.max_user_id, text, [
          ...good.map((v, i) => [openAppButton(`${i + 1}. ${v.company.slice(0, 30)}`, bot, `i${v.id}`) ]),
          [openAppButton('🚀 Вся подборка', bot, 'feed') ],
        ]);
        await repo.markNotified(user.max_user_id, null, 'digest');
        sent++;
      } catch (e) {
        log.warn(`Не удалось отправить дайджест пользователю ${user.max_user_id}`, e instanceof Error ? e.message : e);
      }
    }
    return sent;
  }

  return {
    async run() {
      if (!cfg.MAX_BOT_TOKEN) {
        log.warn('MAX_BOT_TOKEN не задан — уведомления отключены');
        return;
      }
      const a = await deadlineReminders();
      const b = await digests();
      if (a || b) log.info(`Уведомления: напоминаний ${a}, дайджестов ${b}`);
    },
  };
}
