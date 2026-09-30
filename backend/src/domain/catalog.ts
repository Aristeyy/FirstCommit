import type { InternshipRow } from '../db/repo';
import { daysUntil, matchScore, recruitmentStatus, type MatchResult, type Profile, type Recruitment } from './match';
import { directionLabel } from './taxonomy';

export interface InternshipView {
  id: number;
  kind: 'program' | 'vacancy';
  company: string;
  title: string;
  direction: string;
  direction_label: string;
  stack: string[];
  format: string;
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
  status: Recruitment;
  days_left: number | null;
  summary: string | null;
  requirements: string[];
  stages: string[];
  apply_url: string;
  source: { id: string; name: string; url: string };
  source_url: string;
  published_at: string | null;
  fetched_at: string;
  is_new: boolean;
  is_synthetic: boolean;
  data_note: string | null;
  match: MatchResult;
  tracked: boolean;
}

export function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toView(r: InternshipRow, profile: Profile, tracked: Set<number>): InternshipView {
  const opens = parseDate(r.opens_at);
  const deadline = parseDate(r.deadline);
  const status = recruitmentStatus(opens, deadline);
  const daysLeft =
    status === 'soon' && opens ? daysUntil(opens) : status === 'open' && deadline ? daysUntil(deadline) : null;
  return {
    id: r.id,
    kind: r.kind,
    company: r.company,
    title: r.title,
    direction: r.direction,
    direction_label: directionLabel(r.direction),
    stack: r.stack,
    format: r.format,
    cities: r.cities,
    region: r.region,
    paid: r.paid,
    salary_from: r.salary_from,
    salary_to: r.salary_to,
    min_course: r.min_course,
    duration: r.duration,
    opens_at: r.opens_at,
    deadline: r.deadline,
    starts_at: r.starts_at,
    status,
    days_left: daysLeft,
    summary: r.summary,
    requirements: r.requirements,
    stages: r.stages,
    apply_url: r.apply_url,
    source: { id: r.source_id, name: r.source_name, url: r.source_url_root },
    source_url: r.source_url,
    published_at: r.published_at ? new Date(r.published_at).toISOString() : null,
    fetched_at: new Date(r.fetched_at).toISOString(),
    is_new: Date.now() - new Date(r.first_seen_at).getTime() < 3 * 86_400_000,
    is_synthetic: r.is_synthetic,
    data_note: r.data_note,
    match: matchScore(profile, r),
    tracked: tracked.has(r.id),
  };
}

export interface SearchFilters {
  q?: string;
  directions?: string[];
  stack?: string[];
  formats?: string[];
  city?: string;
  paid_only?: boolean;
  status?: 'active' | 'open' | 'soon' | 'all';
  kind?: 'program' | 'vacancy' | 'all';
  fit_course?: boolean;
  sort?: 'match' | 'deadline' | 'new';
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  total: number;
  items: InternshipView[];
  facets: { directions: Record<string, number>; status: Record<string, number> };
}

export function search(rows: InternshipRow[], profile: Profile, tracked: Set<number>, f: SearchFilters): SearchResult {
  const q = f.q?.trim().toLowerCase();
  const status = f.status ?? 'active';
  let views = rows.map((r) => toView(r, profile, tracked));

  views = views.filter((v) => {
    if (status === 'active' && v.status === 'closed') return false;
    if (status === 'open' && !(v.status === 'open' || v.status === 'rolling')) return false;
    if (status === 'soon' && v.status !== 'soon') return false;
    if (f.kind && f.kind !== 'all' && v.kind !== f.kind) return false;
    if (f.stack?.length && !f.stack.some((s) => v.stack.includes(s))) return false;
    if (f.formats?.length && !f.formats.includes(v.format)) return false;
    if (f.city) {
      const c = f.city.toLowerCase();
      if (!(v.format === 'remote' || v.cities.some((x) => x.toLowerCase() === c))) return false;
    }
    if (f.paid_only && v.paid === false) return false;
    if (f.fit_course && profile.course !== null && v.min_course !== null && profile.course < v.min_course) return false;
    if (q) {
      const hay = `${v.title} ${v.company} ${v.stack.join(' ')} ${v.cities.join(' ')} ${v.direction_label}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const facets = { directions: {} as Record<string, number>, status: {} as Record<string, number> };
  for (const v of views) {
    facets.directions[v.direction] = (facets.directions[v.direction] ?? 0) + 1;
    facets.status[v.status] = (facets.status[v.status] ?? 0) + 1;
  }
  if (f.directions?.length) views = views.filter((v) => f.directions!.includes(v.direction));

  const statusRank: Record<Recruitment, number> = { open: 0, rolling: 1, soon: 2, closed: 3 };
  const deadlineKey = (v: InternshipView) => (v.deadline ? parseDate(v.deadline)!.getTime() : Number.MAX_SAFE_INTEGER);
  const newKey = (v: InternshipView) => new Date(v.published_at ?? v.fetched_at).getTime();
  views.sort((a, b) => {
    if (f.sort === 'deadline') return statusRank[a.status] - statusRank[b.status] || deadlineKey(a) - deadlineKey(b);
    if (f.sort === 'new') return newKey(b) - newKey(a);
    return b.match.score - a.match.score || statusRank[a.status] - statusRank[b.status] || deadlineKey(a) - deadlineKey(b);
  });

  const offset = Math.max(0, f.offset ?? 0);
  const limit = Math.min(100, Math.max(1, f.limit ?? 30));
  return { total: views.length, items: views.slice(offset, offset + limit), facets };
}
