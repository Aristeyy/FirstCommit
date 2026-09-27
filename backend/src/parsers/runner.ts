import { config } from '../config';
import { db, withTx } from '../db/pool';
import { log } from '../log';
import { habrAdapter } from './habr';
import { createProgramsAdapter } from './programs';
import { trudvsemAdapter } from './trudvsem';
import type { NormalizedInternship, SourceAdapter } from './types';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { SNAPSHOT_DIR } from './habr';

async function snapshotNote(): Promise<string> {
  try {
    const meta = JSON.parse(await readFile(path.join(SNAPSHOT_DIR, 'meta.json'), 'utf8')) as { captured_at: string };
    return `Сохранённый снимок источника от ${meta.captured_at}. Проверьте актуальность по ссылке.`;
  } catch {
    return 'Сохранённый снимок источника. Проверьте актуальность по ссылке.';
  }
}

async function programsAnchor(): Promise<Date> {
  const { rows } = await db().query<{ d: Date | null }>(
    "SELECT min(first_seen_at) AS d FROM internships WHERE source_id = 'curated'",
  );
  return rows[0]?.d ? new Date(rows[0].d) : new Date();
}

export const ADAPTERS: SourceAdapter[] = [createProgramsAdapter(programsAnchor), habrAdapter, trudvsemAdapter];

async function upsertSource(a: SourceAdapter) {
  await db().query(
    `INSERT INTO sources (id, name, kind, url) VALUES ($1,$2,$3,$4)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, kind = EXCLUDED.kind, url = EXCLUDED.url`,
    [a.meta.id, a.meta.name, a.meta.kind, a.meta.url],
  );
}

async function save(sourceId: string, items: NormalizedInternship[]) {
  await withTx(async (c) => {
    for (const i of items) {
      await c.query(
        `INSERT INTO internships (source_id, external_id, kind, company, title, direction, stack, format, cities, region,
           paid, salary_from, salary_to, min_course, duration, opens_at, deadline, starts_at, summary, requirements, stages,
           apply_url, source_url, published_at, fetched_at, is_synthetic, data_note, active, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,now(),$25,$26,TRUE,now())
         ON CONFLICT (source_id, external_id) DO UPDATE SET
           kind=EXCLUDED.kind, company=EXCLUDED.company, title=EXCLUDED.title, direction=EXCLUDED.direction,
           stack=EXCLUDED.stack, format=EXCLUDED.format, cities=EXCLUDED.cities, region=EXCLUDED.region, paid=EXCLUDED.paid,
           salary_from=EXCLUDED.salary_from, salary_to=EXCLUDED.salary_to, min_course=EXCLUDED.min_course,
           duration=EXCLUDED.duration, opens_at=EXCLUDED.opens_at, deadline=EXCLUDED.deadline, starts_at=EXCLUDED.starts_at,
           summary=EXCLUDED.summary, requirements=EXCLUDED.requirements, stages=EXCLUDED.stages, apply_url=EXCLUDED.apply_url,
           source_url=EXCLUDED.source_url, published_at=EXCLUDED.published_at, fetched_at=now(),
           is_synthetic=EXCLUDED.is_synthetic, data_note=EXCLUDED.data_note, active=TRUE, updated_at=now()`,
        [
          sourceId, i.external_id, i.kind, i.company, i.title, i.direction, i.stack, i.format, i.cities, i.region,
          i.paid, i.salary_from, i.salary_to, i.min_course, i.duration, i.opens_at, i.deadline, i.starts_at, i.summary,
          i.requirements, i.stages, i.apply_url, i.source_url, i.published_at, i.is_synthetic, i.data_note,
        ],
      );
    }
    // Всё, чего больше нет в источнике, скрываем (но не удаляем — на запись могут ссылаться отслеживания).
    await c.query('UPDATE internships SET active = FALSE WHERE source_id = $1 AND NOT (external_id = ANY($2::text[]))', [
      sourceId,
      items.map((i) => i.external_id),
    ]);
    await c.query(
      `UPDATE sources SET last_run_at = now(), last_success_at = now(), last_error = NULL,
         items_count = $2 WHERE id = $1`,
      [sourceId, items.length],
    );
  });
}

export async function runParsers(): Promise<void> {
  const mode = config().DATA_MODE;
  for (const a of ADAPTERS) {
    await upsertSource(a);
    let items: NormalizedInternship[] | null = null;
    let usedMode: 'live' | 'offline' = mode;
    try {
      items = await a.fetch(mode);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.warn(`Источник ${a.meta.id}: ошибка сбора (${mode})`, msg);
      await db().query('UPDATE sources SET last_run_at = now(), last_error = $2 WHERE id = $1', [a.meta.id, msg.slice(0, 300)]);
      // Если живой источник недоступен и данных ещё нет — берём сохранённый снимок, чтобы сценарий не был пустым.
      const { rows } = await db().query('SELECT count(*)::int AS n FROM internships WHERE source_id = $1', [a.meta.id]);
      if (mode === 'live' && rows[0].n === 0) {
        items = await a.fetch('offline').catch(() => null);
        usedMode = 'offline';
      }
    }
    if (items && items.length > 0) {
      if (usedMode === 'offline' && a.meta.kind !== 'curated') {
        const note = await snapshotNote();
        items = items.map((i) => ({ ...i, data_note: note }));
      }
      await save(a.meta.id, items);
      await db().query('UPDATE sources SET mode = $2 WHERE id = $1', [a.meta.id, usedMode]);
      log.info(`Источник ${a.meta.id}: сохранено ${items.length} записей (${usedMode})`);
    } else if (items) {
      log.warn(`Источник ${a.meta.id}: получено 0 записей — старые данные сохранены`);
    }
  }
}
