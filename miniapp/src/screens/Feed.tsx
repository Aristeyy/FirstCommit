import { Button, Input, Switch, Typography } from '@maxhub/max-ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, type Filters, type Internship, type Meta, type SearchResult } from '../api';
import { Chip, EmptyState, ErrorState, InternshipCard, Loading } from '../components';
import { plural } from '../format';

export const DEFAULT_FILTERS: Filters = {
  q: '',
  directions: [],
  stack: [],
  formats: [],
  city: '',
  paid_only: false,
  fit_course: true,
  status: 'active',
  sort: 'match',
};

function advancedCount(f: Filters): number {
  return (
    f.stack.length +
    f.formats.length +
    (f.city ? 1 : 0) +
    (f.paid_only ? 1 : 0) +
    (!f.fit_course ? 1 : 0) +
    (f.status !== 'active' ? 1 : 0)
  );
}

interface Props {
  meta: Meta | null;
  filters: Filters;
  setFilters: (f: Filters) => void;
  onOpen: (id: number) => void;
  onToggleTrack: (item: Internship) => Promise<boolean>;
  reloadKey: number;
}

export function Feed({ meta, filters, setFilters, onOpen, onToggleTrack, reloadKey }: Props) {
  const [data, setData] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [query, setQuery] = useState(filters.q);
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await api.search(filters);
      if (id === reqId.current) setData(res);
    } catch (e) {
      if (id === reqId.current) setError(e instanceof ApiError ? e.message : 'Неизвестная ошибка');
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (query !== filters.q) setFilters({ ...filters, q: query });
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  const loadMore = async () => {
    if (!data) return;
    setLoadingMore(true);
    try {
      const more = await api.search(filters, data.items.length);
      setData({ ...data, items: [...data.items, ...more.items] });
    } catch {
    } finally {
      setLoadingMore(false);
    }
  };

  const toggleTrack = async (item: Internship) => {
    const ok = await onToggleTrack(item);
    if (ok && data) setData({ ...data, items: data.items.map((x) => (x.id === item.id ? { ...x, tracked: !x.tracked } : x)) });
  };

  const toggleIn = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const adv = advancedCount(filters);
  const dirCounts = data?.facets.directions ?? {};

  return (
    <div className="feed">
      <div className="feed__controls">
        <Input
          placeholder="Компания, стек, город…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          withClearButton
          aria-label="Поиск"
        />
        <div className="chips-row" role="group" aria-label="Направление">
          <Chip active={filters.directions.length === 0} onClick={() => setFilters({ ...filters, directions: [] })}>
            Все
          </Chip>
          {meta?.directions
            .filter((d) => dirCounts[d.id] || filters.directions.includes(d.id))
            .map((d) => (
              <Chip
                key={d.id}
                active={filters.directions.includes(d.id)}
                count={dirCounts[d.id] ?? 0}
                onClick={() => setFilters({ ...filters, directions: toggleIn(filters.directions, d.id) })}
              >
                {d.emoji} {d.label}
              </Chip>
            ))}
        </div>
        <div className="toolbar">
          <div className="segmented" role="tablist" aria-label="Сортировка">
            {(
              [
                ['match', 'Подходящие'],
                ['deadline', 'Дедлайн'],
                ['new', 'Новые'],
              ] as const
            ).map(([v, l]) => (
              <button key={v} role="tab" aria-selected={filters.sort === v} className={filters.sort === v ? 'on' : ''} onClick={() => setFilters({ ...filters, sort: v })}>
                {l}
              </button>
            ))}
          </div>
          <button type="button" className={`filter-btn${adv ? ' filter-btn--on' : ''}`} onClick={() => setSheet(true)}>
            Фильтры{adv ? ` · ${adv}` : ''}
          </button>
        </div>
      </div>

      {loading && !data && <Loading text="Подбираем стажировки…" />}
      {error && <ErrorState message={error} onRetry={load} />}
      {data && !error && (
        <>
          <div className="feed__summary muted" aria-live="polite">
            {loading ? 'Обновляем…' : `Найдено ${data.total} ${plural(data.total, 'стажировка', 'стажировки', 'стажировок')}`}
          </div>
          {data.items.length === 0 ? (
            <EmptyState
              title="Ничего не нашлось"
              text="Попробуйте убрать часть фильтров или выбрать другое направление."
              action={
                <Button variant="secondary" onClick={() => { setQuery(''); setFilters({ ...DEFAULT_FILTERS, sort: filters.sort }); }}>
                  Сбросить фильтры
                </Button>
              }
            />
          ) : (
            <div className="list">
              {data.items.map((it) => (
                <InternshipCard key={it.id} item={it} onOpen={() => onOpen(it.id)} onToggleTrack={() => void toggleTrack(it)} />
              ))}
              {data.items.length < data.total && (
                <Button variant="secondary" stretched loading={loadingMore} onClick={loadMore}>
                  Показать ещё
                </Button>
              )}
            </div>
          )}
        </>
      )}

      {sheet && meta && (
        <div className="sheet-backdrop" onClick={() => setSheet(false)}>
          <div className="sheet" role="dialog" aria-label="Фильтры" onClick={(e) => e.stopPropagation()}>
            <div className="sheet__handle" />
            <Typography.Title variant="medium-strong">Фильтры</Typography.Title>

            <div className="field-label">Набор</div>
            <div className="chips-wrap">
              {(
                [
                  ['active', 'Открыт или скоро'],
                  ['open', 'Открыт сейчас'],
                  ['soon', 'Скоро откроется'],
                  ['all', 'Все, включая завершённые'],
                ] as const
              ).map(([v, l]) => (
                <Chip key={v} active={filters.status === v} onClick={() => setFilters({ ...filters, status: v })}>
                  {l}
                </Chip>
              ))}
            </div>

            <div className="field-label">Формат</div>
            <div className="chips-wrap">
              {meta.formats.map((f) => (
                <Chip key={f.id} active={filters.formats.includes(f.id)} onClick={() => setFilters({ ...filters, formats: toggleIn(filters.formats, f.id) })}>
                  {f.label}
                </Chip>
              ))}
            </div>

            <div className="field-label">Город (удалённые показываются всегда)</div>
            <div className="chips-wrap">
              <Chip active={!filters.city} onClick={() => setFilters({ ...filters, city: '' })}>
                Любой
              </Chip>
              {meta.cities.slice(0, 14).map((c) => (
                <Chip key={c} active={filters.city === c} onClick={() => setFilters({ ...filters, city: filters.city === c ? '' : c })}>
                  {c}
                </Chip>
              ))}
            </div>

            <div className="field-label">Стек</div>
            <div className="chips-wrap">
              {meta.stack.map((s) => (
                <Chip key={s} active={filters.stack.includes(s)} onClick={() => setFilters({ ...filters, stack: toggleIn(filters.stack, s) })}>
                  {s}
                </Chip>
              ))}
            </div>

            <label className="switch-row">
              <span>Только оплачиваемые</span>
              <Switch checked={filters.paid_only} onChange={(e) => setFilters({ ...filters, paid_only: e.target.checked })} />
            </label>
            <label className="switch-row">
              <span>Скрыть, куда по курсу ещё не берут</span>
              <Switch checked={filters.fit_course} onChange={(e) => setFilters({ ...filters, fit_course: e.target.checked })} />
            </label>

            <div className="sheet__actions">
              <Button variant="secondary" onClick={() => { setQuery(''); setFilters({ ...DEFAULT_FILTERS, sort: filters.sort }); }}>
                Сбросить
              </Button>
              <Button onClick={() => setSheet(false)}>{data ? `Показать ${data.total}` : 'Готово'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
