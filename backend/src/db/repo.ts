import { db } from './pool';
import type { Profile } from '../domain/match';

export interface InternshipRow {
  id: number;
  source_id: string;
  source_name: string;
  source_url_root: string;
  external_id: string;
  kind: 'program' | 'vacancy';
  company: string;
  title: string;
  direction: string;
  stack: string[];
  format: 'remote' | 'hybrid' | 'office';
  cities: string[];
  region: string | null;
  paid: boolean | null;
  salary_from: number | null;
  salary_to: number | null;
  min_course: number | null;
  duration: string | null;
  opens_at: string | null;
  deadline: string | null;
  starts_at: string | null;
  summary: string | null;
  requirements: string[];
  stages: string[];
  apply_url: string;
  source_url: string;
  published_at: Date | null;
  fetched_at: Date;
  first_seen_at: Date;
  is_synthetic: boolean;
  data_note: string | null;
  active: boolean;
}

export interface UserRow extends Profile {
  max_user_id: number;
  first_name: string | null;
  notify: boolean;
  onboarding_step: string | null;
  onboarded_at: Date | null;
  last_digest_at: Date | null;
}

const SELECT_INTERNSHIP = `
  SELECT i.*, s.name AS source_name, s.url AS source_url_root
  FROM internships i JOIN sources s ON s.id = i.source_id`;

export async function listActiveInternships(): Promise<InternshipRow[]> {
  const { rows } = await db().query<InternshipRow>(`${SELECT_INTERNSHIP} WHERE i.active`);
  return rows;
}

export async function getInternship(id: number): Promise<InternshipRow | null> {
  const { rows } = await db().query<InternshipRow>(`${SELECT_INTERNSHIP} WHERE i.id = $1`, [id]);
  return rows[0] ?? null;
}

/** max_user_id приходит как BIGINT (строка) — приводим к number, id MAX помещаются в безопасный диапазон. */
function mapUser(r: UserRow & { max_user_id: number | string }): UserRow {
  return { ...r, max_user_id: Number(r.max_user_id) };
}

export async function getUser(id: number): Promise<UserRow | null> {
  const { rows } = await db().query('SELECT * FROM users WHERE max_user_id = $1', [id]);
  return rows[0] ? mapUser(rows[0]) : null;
}

export async function ensureUser(id: number, firstName?: string | null): Promise<UserRow> {
  const { rows } = await db().query(
    `INSERT INTO users (max_user_id, first_name) VALUES ($1, $2)
     ON CONFLICT (max_user_id) DO UPDATE SET first_name = COALESCE(EXCLUDED.first_name, users.first_name)
     RETURNING *`,
    [id, firstName ?? null],
  );
  return mapUser(rows[0]);
}

export type ProfilePatch = Partial<
  Pick<UserRow, 'directions' | 'stack' | 'course' | 'city' | 'formats' | 'paid_only' | 'notify' | 'onboarding_step'>
> & { onboarded?: boolean };

const PATCHABLE = ['directions', 'stack', 'course', 'city', 'formats', 'paid_only', 'notify', 'onboarding_step'] as const;

export async function updateUser(id: number, patch: ProfilePatch): Promise<UserRow> {
  const sets: string[] = [];
  const vals: unknown[] = [id];
  for (const k of PATCHABLE) {
    if (patch[k] !== undefined) {
      vals.push(patch[k]);
      sets.push(`${k} = $${vals.length}`);
    }
  }
  if (patch.onboarded) sets.push('onboarded_at = COALESCE(onboarded_at, now())');
  sets.push('updated_at = now()');
  const { rows } = await db().query(`UPDATE users SET ${sets.join(', ')} WHERE max_user_id = $1 RETURNING *`, vals);
  if (!rows[0]) throw new Error('Пользователь не найден');
  return mapUser(rows[0]);
}

export async function trackedIds(userId: number): Promise<Set<number>> {
  const { rows } = await db().query<{ internship_id: number }>('SELECT internship_id FROM tracked WHERE user_id = $1', [userId]);
  return new Set(rows.map((r) => r.internship_id));
}

export async function setTracked(userId: number, internshipId: number, on: boolean): Promise<void> {
  if (on) {
    await db().query('INSERT INTO tracked (user_id, internship_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, internshipId]);
  } else {
    await db().query('DELETE FROM tracked WHERE user_id = $1 AND internship_id = $2', [userId, internshipId]);
  }
}

export async function listTracked(userId: number): Promise<InternshipRow[]> {
  const { rows } = await db().query<InternshipRow>(
    `${SELECT_INTERNSHIP} JOIN tracked t ON t.internship_id = i.id WHERE t.user_id = $1 ORDER BY t.created_at DESC`,
    [userId],
  );
  return rows;
}

export interface SourceRow {
  id: string;
  name: string;
  kind: string;
  url: string;
  last_success_at: Date | null;
  last_error: string | null;
  items_count: number;
  mode: string | null;
}

export async function listSources(): Promise<SourceRow[]> {
  const { rows } = await db().query<SourceRow>('SELECT * FROM sources ORDER BY id');
  return rows;
}

export async function listCities(): Promise<string[]> {
  const { rows } = await db().query<{ c: string; n: number }>(
    `SELECT c, count(*)::int AS n FROM internships, unnest(cities) AS c WHERE active GROUP BY c ORDER BY n DESC, c LIMIT 40`,
  );
  return rows.map((r) => r.c);
}

/** Журнал уведомлений: вставка вернёт false, если такое уведомление уже отправлялось. */
export async function markNotified(userId: number, internshipId: number | null, kind: string): Promise<boolean> {
  const res = await db().query(
    `INSERT INTO notifications_log (user_id, internship_id, kind) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, internship_id, kind) DO NOTHING`,
    [userId, internshipId, kind],
  );
  return (res.rowCount ?? 0) > 0;
}
