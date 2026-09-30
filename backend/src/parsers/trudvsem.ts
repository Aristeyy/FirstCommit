import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { classifyDirection, extractStack, looksLikeInternship, looksLikeIT, normalizeCity } from '../domain/taxonomy';
import { clip, pause, politeFetch } from './http';
import { SNAPSHOT_DIR } from './habr';
import type { NormalizedInternship, SourceAdapter } from './types';

const API = 'https://opendata.trudvsem.ru/api/v1/vacancies';
export const TRUDVSEM_QUERIES = ['стажер', 'практикант', 'junior', 'студент программист'];
const PAGE_LIMIT = 100;
const MAX_PAGES_PER_QUERY = 6;

interface TvVacancy {
  id: string;
  'job-name'?: string;
  'creation-date'?: string;
  date_modify?: string;
  salary_min?: number;
  salary_max?: number;
  vac_url?: string;
  schedule?: string;
  employment?: string;
  duty?: string;
  requirements?: string;
  qualification?: string;
  region?: { name?: string };
  company?: { name?: string };
  category?: { specialisation?: string };
  requirement?: { education?: string; experience?: number; qualification?: string };
  addresses?: { address?: { location?: string }[] };
}
interface TvResponse {
  meta?: { total?: number };
  results?: { vacancies?: { vacancy: TvVacancy }[] };
}

function cityFrom(v: TvVacancy): string[] {
  const loc = v.addresses?.address?.[0]?.location ?? '';
  const m = loc.match(/(?:^|,\s*)г\.?\s+([А-ЯЁ][а-яё]+(?:-[а-яё]+)*(?:[- ][А-ЯЁ][а-яё]+)*)/u);
  if (m) return [normalizeCity(m[1])];
  const region = v.region?.name ?? '';
  if (/^(Москва|Санкт-Петербург|Севастополь)$/u.test(region)) return [region];
  return [];
}

function normalizeTrudvsem(v: TvVacancy): NormalizedInternship | null {
  const title = (v['job-name'] ?? '').trim();
  if (!title || !v.vac_url) return null;
  const spec = v.category?.specialisation ?? '';
  const body = `${title} ${v.requirements ?? ''} ${v.duty ?? ''} ${v.requirement?.qualification ?? ''}`;
  const details = `${v.requirements ?? ''} ${v.duty ?? ''} ${v.requirement?.qualification ?? ''}`;
  const isIT = looksLikeIT(title) || (/Информационные технологии/i.test(spec) && looksLikeIT(details));
  if (!isIT) return null;
  const internish = looksLikeInternship(`${title} ${v.qualification ?? ''}`) || v.requirement?.experience === 0;
  if (!internish) return null;

  const remote = /удал[её]н|дистанц/i.test(`${v.schedule ?? ''} ${v.employment ?? ''}`);
  const salaryFrom = v.salary_min && v.salary_min > 0 ? v.salary_min : null;
  const salaryTo = v.salary_max && v.salary_max > 0 ? v.salary_max : null;
  const requirements = [v.requirement?.education, v.requirements]
    .map((s) => clip(s, 300))
    .filter((s): s is string => !!s);

  return {
    external_id: v.id,
    kind: 'vacancy',
    company: (v.company?.name ?? 'Работодатель').replace(/\s+/g, ' ').trim(),
    title,
    direction: classifyDirection(title) !== 'other' ? classifyDirection(title) : classifyDirection(body),
    stack: extractStack(body),
    format: remote ? 'remote' : 'office',
    cities: cityFrom(v),
    region: v.region?.name ?? null,
    paid: salaryFrom || salaryTo ? true : null,
    salary_from: salaryFrom,
    salary_to: salaryTo,
    min_course: null,
    duration: null,
    opens_at: null,
    deadline: null,
    starts_at: null,
    summary: clip(v.duty, 500),
    requirements,
    stages: [],
    apply_url: v.vac_url,
    source_url: v.vac_url,
    published_at: v.date_modify ?? v['creation-date'] ?? null,
    is_synthetic: false,
    data_note: null,
  };
}

function parseTrudvsemResponse(json: string): NormalizedInternship[] {
  const data = JSON.parse(json) as TvResponse;
  return (data.results?.vacancies ?? [])
    .map((x) => normalizeTrudvsem(x.vacancy))
    .filter((x): x is NormalizedInternship => x !== null);
}

export const trudvsemAdapter: SourceAdapter = {
  meta: { id: 'trudvsem', name: 'Работа России (открытые данные)', kind: 'official_api', url: 'https://trudvsem.ru/opendata/api' },
  async fetch(mode) {
    const bodies: string[] = [];
    if (mode === 'offline') {
      const files = (await readdir(SNAPSHOT_DIR).catch(() => [] as string[])).filter((f) => /^trudvsem-.*\.json$/.test(f));
      for (const f of files) bodies.push(await readFile(path.join(SNAPSHOT_DIR, f), 'utf8'));
    } else {
      for (const q of TRUDVSEM_QUERIES) {
        for (let page = 0; page < MAX_PAGES_PER_QUERY; page++) {
          const url = `${API}?text=${encodeURIComponent(q)}&offset=${page}&limit=${PAGE_LIMIT}`;
          const body = await politeFetch(url, { accept: 'application/json' });
          bodies.push(body);
          const got = (JSON.parse(body) as TvResponse).results?.vacancies?.length ?? 0;
          await pause(500);
          if (got < PAGE_LIMIT) break;
        }
      }
    }
    const all = bodies.flatMap(parseTrudvsemResponse);
    return [...new Map(all.map((i) => [i.external_id, i])).values()];
  },
};
