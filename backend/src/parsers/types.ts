/** Нормализованная запись, которую возвращает любой адаптер источника. */
export interface NormalizedInternship {
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
  opens_at: string | null; // YYYY-MM-DD
  deadline: string | null; // YYYY-MM-DD
  starts_at: string | null; // YYYY-MM-DD
  summary: string | null;
  requirements: string[];
  stages: string[];
  apply_url: string;
  source_url: string;
  published_at: string | null; // ISO
  is_synthetic: boolean;
  data_note: string | null;
}

export interface SourceMeta {
  id: string;
  name: string;
  kind: 'official_api' | 'public_page' | 'curated';
  url: string;
}

export interface SourceAdapter {
  meta: SourceMeta;
  /** live — обращение к реальному источнику; offline — сохранённый снимок из seed/snapshots. */
  fetch(mode: 'live' | 'offline'): Promise<NormalizedInternship[]>;
}
