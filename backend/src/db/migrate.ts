import { db } from './pool';
import { log } from '../log';

const MIGRATIONS: { id: number; name: string; sql: string }[] = [
  {
    id: 1,
    name: 'init',
    sql: `
      CREATE TABLE sources (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        kind            TEXT NOT NULL,           -- official_api | public_page | curated
        url             TEXT NOT NULL,
        last_run_at     TIMESTAMPTZ,
        last_success_at TIMESTAMPTZ,
        last_error      TEXT,
        items_count     INT NOT NULL DEFAULT 0,
        mode            TEXT                      -- live | offline
      );

      CREATE TABLE internships (
        id               SERIAL PRIMARY KEY,
        source_id        TEXT NOT NULL REFERENCES sources(id),
        external_id      TEXT NOT NULL,
        kind             TEXT NOT NULL,           -- program (сезонный набор) | vacancy (постоянный)
        company          TEXT NOT NULL,
        title            TEXT NOT NULL,
        direction        TEXT NOT NULL,
        stack            TEXT[] NOT NULL DEFAULT '{}',
        format           TEXT NOT NULL,           -- remote | hybrid | office
        cities           TEXT[] NOT NULL DEFAULT '{}',
        region           TEXT,
        paid             BOOLEAN,
        salary_from      INT,
        salary_to        INT,
        min_course       INT,
        duration         TEXT,
        opens_at         DATE,
        deadline         DATE,
        starts_at        DATE,
        summary          TEXT,
        requirements     TEXT[] NOT NULL DEFAULT '{}',
        stages           TEXT[] NOT NULL DEFAULT '{}',
        apply_url        TEXT NOT NULL,
        source_url       TEXT NOT NULL,
        published_at     TIMESTAMPTZ,
        fetched_at       TIMESTAMPTZ NOT NULL,
        is_synthetic     BOOLEAN NOT NULL DEFAULT FALSE,
        data_note        TEXT,
        active           BOOLEAN NOT NULL DEFAULT TRUE,
        first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (source_id, external_id)
      );
      CREATE INDEX internships_active_idx ON internships (active, direction);
      CREATE INDEX internships_first_seen_idx ON internships (first_seen_at);

      CREATE TABLE users (
        max_user_id      BIGINT PRIMARY KEY,
        first_name       TEXT,
        directions       TEXT[] NOT NULL DEFAULT '{}',
        stack            TEXT[] NOT NULL DEFAULT '{}',
        course           INT,
        city             TEXT,
        formats          TEXT[] NOT NULL DEFAULT '{}',
        paid_only        BOOLEAN NOT NULL DEFAULT FALSE,
        notify           BOOLEAN NOT NULL DEFAULT TRUE,
        onboarding_step  TEXT,
        onboarded_at     TIMESTAMPTZ,
        last_digest_at   TIMESTAMPTZ,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE tracked (
        user_id        BIGINT NOT NULL REFERENCES users(max_user_id) ON DELETE CASCADE,
        internship_id  INT NOT NULL REFERENCES internships(id) ON DELETE CASCADE,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, internship_id)
      );

      CREATE TABLE notifications_log (
        id             SERIAL PRIMARY KEY,
        user_id        BIGINT NOT NULL REFERENCES users(max_user_id) ON DELETE CASCADE,
        internship_id  INT REFERENCES internships(id) ON DELETE CASCADE,
        kind           TEXT NOT NULL,             -- deadline_7 | deadline_3 | deadline_1 | opened | digest
        sent_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (user_id, internship_id, kind)
      );
    `,
  },
];

export async function migrate(): Promise<void> {
  const client = await db().connect();
  try {
    await client.query('SELECT pg_advisory_lock(424242)');
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (id INT PRIMARY KEY, name TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())',
    );
    const { rows } = await client.query<{ id: number }>('SELECT id FROM schema_migrations');
    const done = new Set(rows.map((r) => r.id));
    for (const m of MIGRATIONS) {
      if (done.has(m.id)) continue;
      await client.query('BEGIN');
      try {
        await client.query(m.sql);
        await client.query('INSERT INTO schema_migrations (id, name) VALUES ($1, $2)', [m.id, m.name]);
        await client.query('COMMIT');
        log.info(`Миграция ${m.id} (${m.name}) применена`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(424242)').catch(() => undefined);
    client.release();
  }
}
