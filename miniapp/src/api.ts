import { bridge } from './bridge';

export type Status = 'open' | 'soon' | 'closed' | 'rolling';

export interface Internship {
  id: number;
  kind: 'program' | 'vacancy';
  company: string;
  title: string;
  direction: string;
  direction_label: string;
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
  status: Status;
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
  match: { score: number; reasons: string[]; warnings: string[] };
  tracked: boolean;
  active?: boolean;
}

export interface Profile {
  directions: string[];
  stack: string[];
  course: number | null;
  city: string | null;
  formats: string[];
  paid_only: boolean;
  notify: boolean;
  first_name: string | null;
  onboarded: boolean;
}

export interface Meta {
  directions: { id: string; label: string; emoji: string }[];
  formats: { id: string; label: string }[];
  stack: string[];
  cities: string[];
  sources: { id: string; name: string; kind: string; url: string; items: number; updated_at: string | null; mode: string | null; ok: boolean }[];
}

export interface Filters {
  q: string;
  directions: string[];
  stack: string[];
  formats: string[];
  city: string;
  paid_only: boolean;
  fit_course: boolean;
  status: 'active' | 'open' | 'soon' | 'all';
  sort: 'match' | 'deadline' | 'new';
}

export interface SearchResult {
  total: number;
  items: Internship[];
  facets: { directions: Record<string, number>; status: Record<string, number> };
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let token: string | null = null; // только в памяти: в веб-версии MAX приложение живёт в iframe
let loginPromise: Promise<AuthResult> | null = null;

export interface AuthResult {
  profile: Profile;
  start_param: string | null;
  dev: boolean;
}

export function login(): Promise<AuthResult> {
  loginPromise ??= (async () => {
    const body = bridge.inMax ? { initData: bridge.initData } : { dev: true };
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, data?.error?.message ?? 'Не удалось войти');
    token = data.token;
    return { profile: data.profile, start_param: data.start_param, dev: data.dev };
  })().finally(() => {
    loginPromise = null;
  });
  return loginPromise;
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  if (!token) await login();
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, 'Нет соединения с сервером. Проверьте интернет и попробуйте ещё раз.');
  }
  if (res.status === 401 && retry) {
    token = null;
    await login();
    return request<T>(path, init, false);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error?.message ?? `Ошибка сервера (${res.status})`);
  return data as T;
}

function qs(f: Partial<Filters> & { limit?: number; offset?: number }): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === null || v === '' || v === false) continue;
    if (Array.isArray(v)) {
      if (v.length) p.set(k, v.join(','));
    } else p.set(k, String(v));
  }
  return p.toString();
}

export const api = {
  meta: () => fetch('/api/meta').then((r) => (r.ok ? (r.json() as Promise<Meta>) : Promise.reject(new ApiError(r.status, 'Не удалось загрузить справочники')))),
  search: (f: Filters, offset = 0) => request<SearchResult>(`/api/internships?${qs({ ...f, limit: 30, offset })}`),
  item: (id: number) => request<Internship>(`/api/internships/${id}`),
  track: (id: number, on: boolean) => request<{ id: number; tracked: boolean }>(`/api/internships/${id}/track`, { method: 'PUT', body: JSON.stringify({ on }) }),
  tracked: () => request<{ items: Internship[] }>('/api/tracked'),
  saveProfile: (p: Partial<Profile>) => request<Profile>('/api/profile', { method: 'PUT', body: JSON.stringify(p) }),
};
