import { directionLabel } from './taxonomy';

export interface Profile {
  directions: string[];
  stack: string[];
  course: number | null; // 1..6, 7 = выпускник
  city: string | null;
  formats: string[]; // пусто = неважно
  paid_only: boolean;
}

export interface MatchInput {
  direction: string;
  stack: string[];
  format: string;
  cities: string[];
  min_course: number | null;
  paid: boolean | null;
}

export type Recruitment = 'open' | 'soon' | 'closed' | 'rolling';

export interface MatchResult {
  score: number; // 0..100
  reasons: string[]; // почему подходит
  warnings: string[]; // что может помешать
}

/**
 * Прозрачный скоринг вместо «чёрного ящика»: каждое слагаемое объясняется пользователю.
 * Веса: направление 40, стек 30, курс 15, формат/город 15.
 */
export function matchScore(p: Profile, it: MatchInput): MatchResult {
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 0;

  // Направление
  if (p.directions.length === 0) score += 20;
  else if (p.directions.includes(it.direction)) {
    score += 40;
    reasons.push(`Твоё направление: ${directionLabel(it.direction)}`);
  }

  // Стек
  if (p.stack.length === 0) score += 12;
  else {
    const common = it.stack.filter((s) => p.stack.includes(s));
    if (common.length > 0) {
      const denom = Math.min(3, p.stack.length);
      score += Math.round(30 * Math.min(1, common.length / denom));
      reasons.push(`Совпадает стек: ${common.join(', ')}`);
    }
  }

  // Курс
  if (it.min_course === null) {
    score += 15;
  } else if (p.course === null || p.course >= it.min_course) {
    score += 15;
    reasons.push(it.min_course <= 1 ? 'Можно с 1 курса' : `Берут с ${it.min_course} курса`);
  } else {
    warnings.push(`Берут с ${it.min_course} курса`);
  }

  // Формат и город
  const wantsRemote = p.formats.length === 0 || p.formats.includes('remote');
  const inCity = !!p.city && it.cities.some((c) => c.toLowerCase() === p.city!.toLowerCase());
  if (it.format === 'remote' && wantsRemote) {
    score += 15;
    reasons.push('Можно удалённо');
  } else if (inCity) {
    score += 15;
    reasons.push(`В твоём городе: ${p.city}`);
  } else if (it.format === 'hybrid' && wantsRemote) {
    score += 7;
  } else if (p.city && it.cities.length > 0 && it.format !== 'remote') {
    warnings.push(`Офис: ${it.cities.slice(0, 2).join(', ')}`);
  }

  if (p.paid_only && it.paid === false) warnings.push('Неоплачиваемая');

  return { score: Math.max(0, Math.min(100, score)), reasons, warnings };
}

/** Состояние набора. Для постоянных вакансий дедлайна нет — «набор идёт постоянно». */
export function recruitmentStatus(
  opensAt: Date | null,
  deadline: Date | null,
  today: Date = startOfDay(new Date()),
): Recruitment {
  if (deadline && startOfDay(deadline) < today) return 'closed';
  if (opensAt && startOfDay(opensAt) > today) return 'soon';
  if (!deadline) return 'rolling';
  return 'open';
}

export function daysUntil(d: Date, today: Date = startOfDay(new Date())): number {
  return Math.round((startOfDay(d).getTime() - today.getTime()) / 86_400_000);
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
