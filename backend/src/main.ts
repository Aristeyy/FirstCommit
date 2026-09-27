import { buildServer } from './api/server';
import { createBot } from './bot/bot';
import { config } from './config';
import { closeDb, db, waitForDb } from './db/pool';
import { migrate } from './db/migrate';
import { log } from './log';
import { createNotifier } from './notify/notifier';
import { runParsers } from './parsers/runner';

const role = process.argv[2];
const stops: (() => Promise<void> | void)[] = [];

async function runApi() {
  const app = await buildServer();
  await app.listen({ host: '0.0.0.0', port: config().API_PORT });
  log.info(`API слушает порт ${config().API_PORT}`);
  stops.push(() => app.close());
}

async function runBot() {
  const { bot, start } = createBot();
  stops.push(() => bot.stopPolling());
  await start();
}

/** Воркер: периодический сбор данных и отправка уведомлений. Ошибка одного цикла не роняет процесс. */
async function runWorker() {
  const cfg = config();
  const notifier = createNotifier();
  let busy = false;

  const parseCycle = async () => {
    if (busy) return;
    busy = true;
    try {
      await runParsers();
    } catch (e) {
      log.error('Цикл сбора завершился с ошибкой', e);
    } finally {
      busy = false;
    }
  };
  const notifyCycle = async () => {
    try {
      await notifier.run();
    } catch (e) {
      log.error('Цикл уведомлений завершился с ошибкой', e);
    }
  };

  // При старте собираем данные, если их ещё нет или они устарели
  const { rows } = await db().query<{ fresh: boolean }>(
    `SELECT coalesce(max(last_success_at) > now() - make_interval(mins => $1), false) AS fresh FROM sources`,
    [cfg.PARSER_INTERVAL_MIN],
  );
  if (!rows[0]?.fresh) await parseCycle();
  await notifyCycle();

  const t1 = setInterval(parseCycle, cfg.PARSER_INTERVAL_MIN * 60_000);
  const t2 = setInterval(notifyCycle, cfg.NOTIFY_INTERVAL_MIN * 60_000);
  stops.push(() => {
    clearInterval(t1);
    clearInterval(t2);
  });
  log.info(`Воркер запущен: сбор каждые ${cfg.PARSER_INTERVAL_MIN} мин, уведомления каждые ${cfg.NOTIFY_INTERVAL_MIN} мин`);
}

async function shutdown(signal: string) {
  log.info(`Получен ${signal}, завершаем работу`);
  for (const s of stops.reverse()) await Promise.resolve(s()).catch(() => undefined);
  await closeDb().catch(() => undefined);
  process.exit(0);
}

async function main() {
  if (!['api', 'bot', 'worker', 'parse-once'].includes(role)) {
    console.error('Использование: node dist/main.js <api|bot|worker|parse-once>');
    process.exit(2);
  }
  config(); // валидация окружения до старта
  await waitForDb();
  await migrate();
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  if (role === 'api') await runApi();
  if (role === 'bot') await runBot();
  if (role === 'worker') await runWorker();
  if (role === 'parse-once') {
    await runParsers();
    await closeDb();
  }
}

process.on('unhandledRejection', (e) => log.error('Необработанное отклонение промиса', e));

main().catch((e) => {
  log.error('Критическая ошибка запуска', e);
  process.exit(1);
});
