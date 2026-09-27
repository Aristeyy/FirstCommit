import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { toIsoDate } from './http';
import type { NormalizedInternship, SourceAdapter } from './types';

interface Track {
  direction: string;
  stack: string[];
  requirements: string[];
}
interface Program {
  id: string;
  company: string;
  title: string;
  url: string;
  format: 'remote' | 'hybrid' | 'office';
  cities: string[];
  paid: boolean;
  min_course: number | null;
  duration: string | null;
  opens_offset: number | null;
  deadline_offset: number | null;
  starts_offset: number | null;
  summary: string;
  stages: string[];
  tracks: Track[];
}

const FILE = path.resolve(__dirname, '../../seed/programs.json');
export const PROGRAMS_NOTE =
  'Демо-данные: название и ссылка реальные, описание обобщённое, сроки набора условные. Актуальные условия — на сайте компании.';

function shift(anchor: Date, days: number | null): string | null {
  if (days === null) return null;
  const d = new Date(anchor);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

/**
 * Сезонные программы стажировок крупных IT-компаний. В MVP это курируемый справочник
 * (в пилоте его поддерживает карьерный центр вуза), даты задаются от «якорной» даты —
 * дня первой загрузки, поэтому дедлайны честно приближаются со временем.
 */
export function createProgramsAdapter(getAnchor: () => Promise<Date>): SourceAdapter {
  return {
    meta: { id: 'curated', name: 'Справочник программ стажировок', kind: 'curated', url: 'seed/programs.json' },
    async fetch() {
      const anchor = await getAnchor();
      const { programs } = JSON.parse(await readFile(FILE, 'utf8')) as { programs: Program[] };
      return programs.flatMap((p): NormalizedInternship[] =>
        p.tracks.map((t) => ({
          external_id: `${p.id}:${t.direction}`,
          kind: 'program',
          company: p.company,
          title: `${p.title} — ${trackTitle(t.direction)}`,
          direction: t.direction,
          stack: t.stack,
          format: p.format,
          cities: p.cities,
          region: null,
          paid: p.paid,
          salary_from: null,
          salary_to: null,
          min_course: p.min_course,
          duration: p.duration,
          opens_at: shift(anchor, p.opens_offset),
          deadline: shift(anchor, p.deadline_offset),
          starts_at: shift(anchor, p.starts_offset),
          summary: p.summary,
          requirements: t.requirements,
          stages: p.stages,
          apply_url: p.url,
          source_url: p.url,
          published_at: null,
          is_synthetic: true,
          data_note: PROGRAMS_NOTE,
        })),
      );
    },
  };
}

function trackTitle(direction: string): string {
  const map: Record<string, string> = {
    backend: 'Backend',
    frontend: 'Frontend',
    mobile: 'Mobile',
    qa: 'QA',
    data: 'Аналитика данных',
    ml: 'ML',
    devops: 'DevOps',
    security: 'Безопасность',
    analyst: 'Системный анализ',
    design: 'Дизайн',
    onec: '1С',
  };
  return map[direction] ?? direction;
}
