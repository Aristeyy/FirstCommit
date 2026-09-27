/**
 * Сохраняет «снимок» живых источников в seed/snapshots. Снимок используется
 * в режиме DATA_MODE=offline и как запасной вариант, если источник недоступен.
 * Запуск: npm run snapshot
 */
process.env.DATABASE_URL ||= 'postgres://unused';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pause, politeFetch, toIsoDate } from '../src/parsers/http';
import { SNAPSHOT_DIR } from '../src/parsers/habr';
import { TRUDVSEM_QUERIES } from '../src/parsers/trudvsem';

async function main() {
  await mkdir(SNAPSHOT_DIR, { recursive: true });
  for (const f of await readdir(SNAPSHOT_DIR)) {
    if (/^(habr-page-|trudvsem-)/.test(f)) await rm(path.join(SNAPSHOT_DIR, f));
  }
  for (let p = 1; p <= 4; p++) {
    const html = await politeFetch(`https://career.habr.com/vacancies?qid=1&type=all&sort=date&page=${p}`);
    await writeFile(path.join(SNAPSHOT_DIR, `habr-page-${p}.html`), html);
    console.log(`habr page ${p}: ${html.length} bytes`);
    if (!html.includes(`page=${p + 1}`)) break;
    await pause();
  }
  let n = 0;
  for (const q of TRUDVSEM_QUERIES) {
    for (let page = 0; page < 6; page++) {
      const body = await politeFetch(
        `https://opendata.trudvsem.ru/api/v1/vacancies?text=${encodeURIComponent(q)}&offset=${page}&limit=100`,
        { accept: 'application/json' },
      );
      await writeFile(path.join(SNAPSHOT_DIR, `trudvsem-${String(++n).padStart(2, '0')}.json`), body);
      const got = JSON.parse(body)?.results?.vacancies?.length ?? 0;
      console.log(`trudvsem "${q}" page ${page}: ${got}`);
      await pause(500);
      if (got < 100) break;
    }
  }
  await writeFile(path.join(SNAPSHOT_DIR, 'meta.json'), JSON.stringify({ captured_at: toIsoDate(new Date()) }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
