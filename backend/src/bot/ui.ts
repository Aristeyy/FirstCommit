import { Keyboard } from '@maxhub/max-bot-api';
import type { InternshipView } from '../domain/catalog';

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
export function humanDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

function statusLine(v: InternshipView): string {
  switch (v.status) {
    case 'open':
      if (v.days_left === 0) return '🔥 Приём заявок заканчивается сегодня';
      return `🟢 Набор открыт до ${humanDate(v.deadline!)} · осталось ${v.days_left} ${plural(v.days_left!, 'день', 'дня', 'дней')}`;
    case 'soon':
      return `🕓 Набор откроется ${humanDate(v.opens_at!)} · через ${v.days_left} ${plural(v.days_left!, 'день', 'дня', 'дней')}`;
    case 'rolling':
      return '🟢 Постоянный набор';
    default:
      return `⚪️ Набор завершён${v.deadline ? ` ${humanDate(v.deadline)}` : ''}`;
  }
}

function formatLabel(v: InternshipView): string {
  const f = v.format === 'remote' ? 'удалённо' : v.format === 'hybrid' ? 'гибрид' : 'офис';
  return v.cities.length ? `${f} · ${v.cities.slice(0, 3).join(', ')}${v.cities.length > 3 ? '…' : ''}` : f;
}

export function cardText(v: InternshipView, idx?: number): string {
  const head = `${idx !== undefined ? `${idx}. ` : ''}<b>${esc(v.company)}</b> — ${esc(v.title)}`;
  const lines = [head, statusLine(v), `📍 ${esc(formatLabel(v))}`];
  if (v.match.reasons.length) lines.push(`✅ ${esc(v.match.reasons.slice(0, 2).join(' · '))}`);
  if (v.match.warnings.length) lines.push(`⚠️ ${esc(v.match.warnings[0])}`);
  lines.push(`<i>Подходит на ${v.match.score}% · ${esc(v.source.name)}</i>`);
  return lines.join('\n');
}

export function openAppButton(text: string, botUsername: string, payload?: string) {
  return Keyboard.button.openApp(text, botUsername, undefined, payload);
}
