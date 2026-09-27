import type { Internship } from './api';

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

export function humanDate(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

export function shortDateTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

export type Tone = 'positive' | 'warning' | 'danger' | 'neutral' | 'accent';

export function statusBadge(i: Internship): { text: string; tone: Tone } {
  const d = i.days_left ?? 0;
  switch (i.status) {
    case 'open':
      if (d === 0) return { text: 'Последний день!', tone: 'danger' };
      if (d <= 3) return { text: `До дедлайна ${d} ${plural(d, 'день', 'дня', 'дней')}`, tone: 'danger' };
      if (d <= 7) return { text: `До дедлайна ${d} ${plural(d, 'день', 'дня', 'дней')}`, tone: 'warning' };
      return { text: `Набор до ${humanDate(i.deadline!)}`, tone: 'positive' };
    case 'soon':
      return { text: `Откроется ${humanDate(i.opens_at!)}`, tone: 'accent' };
    case 'rolling':
      return { text: 'Постоянный набор', tone: 'positive' };
    default:
      return { text: 'Набор завершён', tone: 'neutral' };
  }
}

export function formatLabel(f: Internship['format']): string {
  return f === 'remote' ? 'Удалённо' : f === 'hybrid' ? 'Гибрид' : 'Офис';
}

export function salaryLabel(i: Internship): string | null {
  const fmt = (n: number) => `${Math.round(n / 1000)} тыс.`;
  if (i.salary_from && i.salary_to) return `${fmt(i.salary_from)} – ${fmt(i.salary_to)} ₽`;
  if (i.salary_from) return `от ${fmt(i.salary_from)} ₽`;
  if (i.salary_to) return `до ${fmt(i.salary_to)} ₽`;
  if (i.paid === true) return 'Оплачиваемая';
  if (i.paid === false) return 'Без оплаты';
  return null;
}

export function placeLabel(i: Internship): string {
  if (i.format === 'remote') return 'Удалённо';
  const cities = i.cities.length ? i.cities.slice(0, 2).join(', ') + (i.cities.length > 2 ? ` +${i.cities.length - 2}` : '') : i.region ?? '';
  return `${formatLabel(i.format)}${cities ? ` · ${cities}` : ''}`;
}

export const COURSES: { value: number; label: string }[] = [
  { value: 1, label: '1 курс' },
  { value: 2, label: '2 курс' },
  { value: 3, label: '3 курс' },
  { value: 4, label: '4 курс' },
  { value: 5, label: '5–6 / магистр.' },
  { value: 7, label: 'Выпускник' },
];
