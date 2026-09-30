import { readFile } from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { classifyDirection, extractStack, looksLikeIT, normalizeCity } from '../domain/taxonomy';
import { politeFetch, pause } from './http';
import type { NormalizedInternship, SourceAdapter } from './types';

const BASE = 'https://career.habr.com';
const LIST_URL = (page: number) => `${BASE}/vacancies?qid=1&type=all&sort=date&page=${page}`;
const MAX_PAGES = 4;
export const SNAPSHOT_DIR = path.resolve(__dirname, '../../seed/snapshots');

function parseSalary(text: string): { from: number | null; to: number | null } {
  const nums = (text.match(/\d[\d\s]*/g) ?? []).map((n) => Number(n.replace(/\s/g, ''))).filter((n) => n > 1000);
  if (/^\s*до/i.test(text)) return { from: null, to: nums[0] ?? null };
  return { from: nums[0] ?? null, to: nums[1] ?? null };
}

function parseHabrList(html: string): NormalizedInternship[] {
  const $ = cheerio.load(html);
  const out: NormalizedInternship[] = [];
  $('.vacancy-card').each((_, el) => {
    const card = $(el);
    const link = card.find('.vacancy-card__title-link');
    const href = link.attr('href');
    const title = link.text().trim();
    if (!href || !title) return;
    const id = href.split('/').filter(Boolean).pop()!;
    const company = card.find('.vacancy-card__company a').first().text().trim() || 'Компания не указана';
    const skills = card
      .find('.vacancy-card__skills .basic-chip__text, .vacancy-card__skills a')
      .map((_, s) => $(s).text().trim())
      .get()
      .filter(Boolean);
    const uniqSkills = [...new Set(skills)];
    const chips = card
      .find('.vacancy-card__meta .chip-with-icon__text')
      .map((_, s) => $(s).text().trim())
      .get();

    let remote = false;
    const cities: string[] = [];
    for (const c of chips) {
      if (/intern|junior|middle|senior|стаж/i.test(c)) continue;
      if (/удал[её]н/i.test(c)) remote = true;
      else if (/рабочий день|занятост|график/i.test(c)) continue;
      else cities.push(normalizeCity(c));
    }

    const salaryBox = card.find('.vacancy-card__salary');
    const predicted = salaryBox.find('.predicted-salary').length > 0;
    const salaryText = predicted ? '' : salaryBox.text().trim();
    const salary = salaryText ? parseSalary(salaryText) : { from: null, to: null };

    const text = `${title} ${uniqSkills.join(' ')}`;
    const direction = classifyDirection(text);
    if (direction === 'other' && !looksLikeIT(text)) return;
    out.push({
      external_id: id,
      kind: 'vacancy',
      company,
      title,
      direction,
      stack: extractStack(text),
      format: remote ? (cities.length ? 'hybrid' : 'remote') : 'office',
      cities,
      region: null,
      paid: salary.from || salary.to ? true : null,
      salary_from: salary.from,
      salary_to: salary.to,
      min_course: null,
      duration: null,
      opens_at: null,
      deadline: null,
      starts_at: null,
      summary: uniqSkills.length ? `Ключевые навыки: ${uniqSkills.join(', ')}` : null,
      requirements: uniqSkills,
      stages: [],
      apply_url: `${BASE}${href}`,
      source_url: `${BASE}${href}`,
      published_at: card.find('time').attr('datetime') ?? null,
      is_synthetic: false,
      data_note: null,
    });
  });
  return out;
}

export const habrAdapter: SourceAdapter = {
  meta: { id: 'habr_career', name: 'Хабр Карьера', kind: 'public_page', url: `${BASE}/vacancies?qid=1` },
  async fetch(mode) {
    const pages: string[] = [];
    if (mode === 'offline') {
      for (let p = 1; p <= MAX_PAGES; p++) {
        try {
          pages.push(await readFile(path.join(SNAPSHOT_DIR, `habr-page-${p}.html`), 'utf8'));
        } catch {
          break;
        }
      }
    } else {
      for (let p = 1; p <= MAX_PAGES; p++) {
        const html = await politeFetch(LIST_URL(p));
        pages.push(html);
        if (!html.includes(`page=${p + 1}`)) break;
        await pause();
      }
    }
    const all = pages.flatMap(parseHabrList);
    return [...new Map(all.map((i) => [i.external_id, i])).values()];
  },
};
