import { Bot, Keyboard, type Context } from '@maxhub/max-bot-api';
import { config } from '../config';
import * as repo from '../db/repo';
import { search } from '../domain/catalog';
import { DIRECTIONS, QUICK_CITIES, directionLabel, normalizeCity } from '../domain/taxonomy';
import { profileOf } from '../api/server';
import { log } from '../log';
import { cardText, esc, openAppButton, plural } from './ui';

type Body = { text: string; attachments?: ReturnType<typeof Keyboard.inlineKeyboard>[]; format: 'html' };
const COURSES: [number, string][] = [
  [1, '1 курс'], [2, '2 курс'], [3, '3 курс'], [4, '4 курс'], [5, '5–6 курс / магистратура'], [7, 'Уже выпустился'],
];

export function createBot() {
  const cfg = config();
  if (!cfg.MAX_BOT_TOKEN) throw new Error('MAX_BOT_TOKEN не задан — бот не может стартовать');
  const bot = new Bot(cfg.MAX_BOT_TOKEN, { clientOptions: { baseUrl: cfg.MAX_API_BASE } } as never);
  let botUsername = cfg.MAX_BOT_USERNAME;

  const uidOf = (ctx: Context): { id: number; name: string | null } | null => {
    const u = ctx.user ?? ctx.message?.sender ?? null;
    return u ? { id: u.user_id, name: u.first_name ?? u.name ?? null } : null;
  };

  /** В колбэке редактируем исходное сообщение (чистый чат), иначе отправляем новое. */
  async function respond(ctx: Context, body: Body) {
    if (ctx.callback) {
      await ctx.answerOnCallback({ message: body } as never);
    } else {
      await ctx.reply(body.text, { attachments: body.attachments, format: 'html' });
    }
  }

  const appBtn = (text: string, payload?: string) => openAppButton(text, botUsername, payload);

  // ---------- Экраны ----------
  function directionScreen(): Body {
    const dirs = DIRECTIONS.filter((d) => d.id !== 'other');
    const rows = [];
    for (let i = 0; i < dirs.length; i += 2) {
      rows.push(dirs.slice(i, i + 2).map((d) => Keyboard.button.callback(`${d.emoji} ${d.label}`, `ob:dir:${d.id}`)));
    }
    rows.push([Keyboard.button.callback('🤷 Пока не определился', 'ob:dir:any')]);
    return {
      text: '<b>Шаг 1 из 3.</b> Какое направление в IT тебе интереснее всего?\n\nСтек и другие направления можно добавить позже в приложении.',
      attachments: [Keyboard.inlineKeyboard(rows)],
      format: 'html',
    };
  }

  function courseScreen(): Body {
    const rows = [];
    for (let i = 0; i < COURSES.length; i += 2) {
      rows.push(COURSES.slice(i, i + 2).map(([n, l]) => Keyboard.button.callback(l, `ob:course:${n}`)));
    }
    return {
      text: '<b>Шаг 2 из 3.</b> На каком ты курсе? Многие компании берут стажёров только со 2–3 курса — я это учту.',
      attachments: [Keyboard.inlineKeyboard(rows)],
      format: 'html',
    };
  }

  function placeScreen(): Body {
    const cities = QUICK_CITIES.slice(0, 4);
    const rows = [
      [Keyboard.button.callback('🏠 Только удалённо', 'ob:place:remote')],
      ...[0, 2].map((i) => cities.slice(i, i + 2).map((c) => Keyboard.button.callback(`📍 ${c}`, `ob:city:${c}`))),
      [Keyboard.button.callback('✍️ Другой город', 'ob:place:other'), Keyboard.button.callback('Неважно', 'ob:place:any')],
    ];
    return {
      text: '<b>Шаг 3 из 3.</b> Где хочешь стажироваться? Удалённые стажировки я покажу в любом случае.',
      attachments: [Keyboard.inlineKeyboard(rows)],
      format: 'html',
    };
  }

  async function summaryScreen(userId: number): Promise<Body> {
    const user = await repo.getUser(userId);
    const rows = await repo.listActiveInternships();
    const res = search(rows, profileOf(user!), new Set(), { status: 'active', fit_course: true, limit: 100 });
    const good = res.items;
    const strong = good.filter((v) => v.match.score >= 60).length;
    const urgent = good.filter((v) => v.status === 'open' && v.days_left !== null && v.days_left <= 7).length;
    const lines = [
      `Готово! Нашёл <b>${res.total}</b> ${plural(res.total, 'стажировку', 'стажировки', 'стажировок')} с открытым или скорым набором.`,
      `Из них хорошо подходят тебе: <b>${strong}</b>.`,
    ];
    if (urgent) lines.push(`⏰ У ${urgent} ${plural(urgent, 'программы', 'программ', 'программ')} дедлайн в ближайшую неделю.`);
    lines.push('', 'Открой подборку — там фильтры по стеку, формату и городу. Нажми «Отслеживать», и я напомню о дедлайне.');
    return {
      text: lines.join('\n'),
      attachments: [
        Keyboard.inlineKeyboard([
          [appBtn('🚀 Открыть подборку', 'feed')],
          [Keyboard.button.callback('🔥 Топ-3 прямо здесь', 'top')],
          [Keyboard.button.callback('☰ Меню', 'menu')],
        ]),
      ],
      format: 'html',
    };
  }

  async function menuScreen(userId: number): Promise<Body> {
    const user = await repo.getUser(userId);
    const tracked = (await repo.trackedIds(userId)).size;
    const dirs = user?.directions.length ? user.directions.map(directionLabel).join(', ') : 'любое';
    const place = user?.formats.includes('remote') && !user.city ? 'удалённо' : user?.city ?? 'не важно';
    return {
      text: [
        '<b>Первый коммит</b> — стажировки в IT без пропущенных дедлайнов.',
        '',
        `Направление: ${esc(dirs)}`,
        `Курс: ${user?.course ? (user.course === 7 ? 'выпускник' : user.course) : 'не указан'} · Где: ${esc(place)}`,
        `Уведомления: ${user?.notify ? 'включены 🔔' : 'выключены 🔕'}`,
      ].join('\n'),
      attachments: [
        Keyboard.inlineKeyboard([
          [appBtn('🚀 Открыть подборку', 'feed')],
          [Keyboard.button.callback('🔥 Топ-3', 'top'), appBtn(`⭐ Отслеживаю (${tracked})`, 'tracked')],
          [
            Keyboard.button.callback('⚙️ Изменить профиль', 'profile'),
            Keyboard.button.callback(user?.notify ? '🔕 Выкл. уведомления' : '🔔 Вкл. уведомления', user?.notify ? 'notify:off' : 'notify:on'),
          ],
          [Keyboard.button.callback('ℹ️ Откуда данные', 'about')],
        ]),
      ],
      format: 'html',
    };
  }

  async function topScreen(userId: number): Promise<Body> {
    const user = await repo.getUser(userId);
    const res = search(await repo.listActiveInternships(), profileOf(user!), await repo.trackedIds(userId), {
      status: 'active',
      fit_course: true,
      limit: 3,
    });
    if (res.items.length === 0) {
      return {
        text: 'Под твой профиль сейчас ничего не нашлось. Попробуй расширить профиль — например, добавить удалённый формат.',
        attachments: [Keyboard.inlineKeyboard([[Keyboard.button.callback('⚙️ Изменить профиль', 'profile')], [Keyboard.button.callback('☰ Меню', 'menu')]])],
        format: 'html',
      };
    }
    const text = ['<b>Топ-3 под твой профиль:</b>', '', ...res.items.map((v, i) => cardText(v, i + 1) + '\n')].join('\n');
    const rows = res.items.map((v, i) => [
      appBtn(`${i + 1}. Подробнее`, `i${v.id}`),
      Keyboard.button.callback(v.tracked ? '✓ Отслеживаю' : '⭐ Отслеживать', `track:${v.id}`),
    ]);
    rows.push([appBtn(`🚀 Все ${res.total} в приложении`, 'feed')]);
    rows.push([Keyboard.button.callback('☰ Меню', 'menu')]);
    return { text, attachments: [Keyboard.inlineKeyboard(rows)], format: 'html' };
  }

  function aboutScreen(): Body {
    return {
      text: [
        '<b>Откуда данные</b>',
        '• <b>Работа России</b> — официальные открытые данные, вакансии для стажёров и без опыта в IT.',
        '• <b>Хабр Карьера</b> — публичные вакансии уровня «Стажёр».',
        '• <b>Справочник программ</b> — сезонные стажировки крупных компаний. <i>В MVP сроки набора демонстрационные</i>, ссылки ведут на реальные сайты.',
        '',
        'В каждой карточке указан источник и дата обновления. Подать заявку можно только на сайте работодателя — мы не собираем резюме и персональные данные.',
      ].join('\n'),
      attachments: [Keyboard.inlineKeyboard([[Keyboard.button.callback('☰ Меню', 'menu')]])],
      format: 'html',
    };
  }

  async function startOnboarding(ctx: Context, userId: number) {
    await repo.updateUser(userId, { onboarding_step: 'direction' });
    await respond(ctx, directionScreen());
  }

  // ---------- Обработчики ----------
  // Пользователь создаётся при любом событии: кнопки из старых сообщений работают даже после сброса БД
  bot.use(async (ctx, next) => {
    const u = uidOf(ctx) ?? (ctx.callback ? { id: ctx.callback.user.user_id, name: ctx.callback.user.first_name ?? null } : null);
    if (u) await repo.ensureUser(u.id, u.name);
    return next();
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(
      [
        '<b>Что я умею</b>',
        '/menu — главное меню',
        '/top — топ-3 стажировки под твой профиль',
        '/profile — заново пройти настройку профиля',
        '',
        'В подборке нажми ☆ на карточке — я напомню о дедлайне за 7, 3 и 1 день.',
      ].join('\n'),
      { format: 'html' },
    );
  });
  bot.on('bot_started', async (ctx) => {
    const u = uidOf(ctx);
    if (!u) return;
    const user = await repo.ensureUser(u.id, u.name);
    // Название и описание выданного бота на онлайн-этапе изменить нельзя, поэтому продукт представляем в первом сообщении
    const hello = [
      `Привет${u.name ? `, ${esc(u.name)}` : ''}! 👋 Это <b>«Первый коммит»</b> — сервис для студентов IT-направлений.`,
      '',
      'Я соберу стажировки из нескольких источников, отсортирую их под твой профиль и напомню о дедлайне набора, чтобы ты ничего не пропустил.',
      '',
      'Настройка займёт 30 секунд — 3 вопроса.',
    ].join('\n');
    await ctx.reply(hello, { format: 'html' });
    if (user.onboarded_at) await respond(ctx, await menuScreen(u.id));
    else await startOnboarding(ctx, u.id);
  });

  bot.command('start', async (ctx) => {
    const u = uidOf(ctx);
    if (!u) return;
    const user = await repo.ensureUser(u.id, u.name);
    if (user.onboarded_at) await respond(ctx, await menuScreen(u.id));
    else await startOnboarding(ctx, u.id);
  });
  bot.command('menu', async (ctx) => {
    const u = uidOf(ctx);
    if (u) await repo.ensureUser(u.id, u.name).then(() => menuScreen(u.id)).then((b) => respond(ctx, b));
  });
  bot.command('top', async (ctx) => {
    const u = uidOf(ctx);
    if (u) await repo.ensureUser(u.id, u.name).then(() => topScreen(u.id)).then((b) => respond(ctx, b));
  });
  bot.command('profile', async (ctx) => {
    const u = uidOf(ctx);
    if (u) await repo.ensureUser(u.id, u.name).then(() => startOnboarding(ctx, u.id));
  });

  bot.action(/^ob:dir:(\w+)$/, async (ctx) => {
    const u = uidOf(ctx)!;
    const dir = ctx.match![1];
    await repo.ensureUser(u.id, u.name);
    await repo.updateUser(u.id, { directions: dir === 'any' ? [] : [dir], onboarding_step: 'course' });
    await respond(ctx, courseScreen());
  });

  bot.action(/^ob:course:(\d)$/, async (ctx) => {
    const u = uidOf(ctx)!;
    await repo.updateUser(u.id, { course: Number(ctx.match![1]), onboarding_step: 'place' });
    await respond(ctx, placeScreen());
  });

  bot.action(/^ob:place:(remote|any|other)$/, async (ctx) => {
    const u = uidOf(ctx)!;
    const v = ctx.match![1];
    if (v === 'other') {
      await repo.updateUser(u.id, { onboarding_step: 'city_text' });
      await respond(ctx, { text: 'Напиши название своего города одним сообщением, например: <i>Набережные Челны</i>', format: 'html' });
      return;
    }
    await repo.updateUser(u.id, {
      formats: v === 'remote' ? ['remote'] : [],
      city: null,
      onboarding_step: null,
      onboarded: true,
    });
    await respond(ctx, await summaryScreen(u.id));
  });

  bot.action(/^ob:city:(.+)$/, async (ctx) => {
    const u = uidOf(ctx)!;
    await repo.updateUser(u.id, { city: ctx.match![1], formats: [], onboarding_step: null, onboarded: true });
    await respond(ctx, await summaryScreen(u.id));
  });

  bot.action('menu', async (ctx) => respond(ctx, await menuScreen(uidOf(ctx)!.id)));
  bot.action('top', async (ctx) => respond(ctx, await topScreen(uidOf(ctx)!.id)));
  bot.action('about', async (ctx) => respond(ctx, aboutScreen()));
  bot.action('profile', async (ctx) => startOnboarding(ctx, uidOf(ctx)!.id));
  bot.action(/^notify:(on|off)$/, async (ctx) => {
    const u = uidOf(ctx)!;
    await repo.updateUser(u.id, { notify: ctx.match![1] === 'on' });
    await respond(ctx, await menuScreen(u.id));
  });

  bot.action(/^track:(\d+)$/, async (ctx) => {
    const u = uidOf(ctx)!;
    const id = Number(ctx.match![1]);
    const item = await repo.getInternship(id);
    if (!item) {
      await respond(ctx, { text: 'Эта стажировка больше не публикуется.', format: 'html' });
      return;
    }
    const was = (await repo.trackedIds(u.id)).has(id);
    await repo.setTracked(u.id, id, !was);
    // Перерисовываем то сообщение, из которого нажали (топ-3 или уведомление)
    const src = ctx.message?.body?.text ?? '';
    if (src.startsWith('Топ-3')) await respond(ctx, await topScreen(u.id));
    else
      await respond(ctx, {
        text: was
          ? `Больше не отслеживаю «${esc(item.company)} — ${esc(item.title)}».`
          : `⭐ Отслеживаю «${esc(item.company)} — ${esc(item.title)}». Напомню о дедлайне за 7, 3 и 1 день.`,
        attachments: [Keyboard.inlineKeyboard([[appBtn('Открыть карточку', `i${id}`)], [Keyboard.button.callback('☰ Меню', 'menu')]])],
        format: 'html',
      });
  });

  // Свободный текст: ввод города в онбординге, иначе — подсказка
  bot.on('message_created', async (ctx, next) => {
    const u = uidOf(ctx);
    const text = ctx.message?.body?.text?.trim() ?? '';
    if (!u || text.startsWith('/')) return next();
    const user = await repo.ensureUser(u.id, u.name);
    if (user.onboarding_step === 'city_text') {
      const city = normalizeCity(text).slice(0, 60);
      if (city.length < 2 || !/\p{L}/u.test(city)) {
        await ctx.reply('Не похоже на название города. Попробуй ещё раз, например: Казань');
        return;
      }
      await repo.updateUser(u.id, { city, formats: [], onboarding_step: null, onboarded: true });
      await respond(ctx, await summaryScreen(u.id));
      return;
    }
    if (!user.onboarded_at) return startOnboarding(ctx, u.id);
    await respond(ctx, {
      text: 'Я понимаю кнопки и команды /menu, /top, /profile. Вот меню 👇',
      format: 'html',
    });
    await respond(ctx, await menuScreen(u.id));
  });

  // Нажатие на кнопку, для которой нет обработчика (например, из очень старого сообщения)
  bot.on('message_callback', async (ctx) => {
    const u = uidOf(ctx);
    if (u) await respond(ctx, await menuScreen(u.id));
  });

  bot.catch((err, ctx) => {
    log.error(`Ошибка обработки обновления ${ctx?.updateType ?? ''}`, err);
    // Пытаемся сообщить пользователю, чтобы он не остался без ответа
    const body = { text: 'Что-то пошло не так 😕 Попробуй ещё раз или открой /menu.', format: 'html' as const };
    Promise.resolve(ctx?.callback ? ctx.answerOnCallback({ message: body } as never) : ctx?.reply(body.text)).catch(() => undefined);
  });

  return {
    bot,
    async start() {
      const me = await bot.api.getMyInfo();
      botUsername ||= me.username ?? '';
      log.info(`Бот запущен: @${botUsername} (id ${me.user_id})`);
      await bot.api
        .setMyCommands([
          { name: 'menu', description: 'Главное меню' },
          { name: 'top', description: 'Топ-3 стажировки под мой профиль' },
          { name: 'profile', description: 'Изменить профиль' },
          { name: 'help', description: 'Что умеет бот' },
        ])
        .catch((e) => log.warn('Не удалось установить команды', e));
      await bot.start();
    },
  };
}
