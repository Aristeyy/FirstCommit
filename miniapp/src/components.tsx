import { Button, Spinner, Typography } from '@maxhub/max-ui';
import type { ReactNode } from 'react';
import type { Internship } from './api';
import { placeLabel, salaryLabel, statusBadge, type Tone } from './format';

export function Chip(props: { active?: boolean; onClick?: () => void; children: ReactNode; count?: number; disabled?: boolean }) {
  return (
    <button
      type="button"
      className={`chip${props.active ? ' chip--active' : ''}`}
      onClick={props.onClick}
      disabled={props.disabled}
      aria-pressed={props.active}
    >
      {props.children}
      {props.count !== undefined && <span className="chip__count">{props.count}</span>}
    </button>
  );
}

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

export function MatchRing({ score }: { score: number }) {
  const tone = score >= 75 ? 'high' : score >= 50 ? 'mid' : 'low';
  return (
    <div className={`match match--${tone}`} title="Насколько стажировка подходит вашему профилю">
      <span className="match__value">{score}%</span>
    </div>
  );
}

export function Loading({ text = 'Загружаем…' }: { text?: string }) {
  return (
    <div className="state" role="status" aria-live="polite">
      <Spinner size={28} appearance="themed" />
      <Typography.Body variant="small" className="muted">
        {text}
      </Typography.Body>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state" role="alert">
      <div className="state__icon">⚠️</div>
      <Typography.Title variant="small-strong">Не получилось загрузить</Typography.Title>
      <Typography.Body variant="small" className="muted">
        {message}
      </Typography.Body>
      {onRetry && (
        <Button size="medium" variant="secondary" onClick={onRetry}>
          Повторить
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <div className="state">
      <div className="state__icon">🔍</div>
      <Typography.Title variant="small-strong">{title}</Typography.Title>
      <Typography.Body variant="small" className="muted">
        {text}
      </Typography.Body>
      {action}
    </div>
  );
}

export function InternshipCard({ item, onOpen, onToggleTrack }: { item: Internship; onOpen: () => void; onToggleTrack: () => void }) {
  const st = statusBadge(item);
  const salary = salaryLabel(item);
  return (
    <article className={`card${item.status === 'closed' ? ' card--muted' : ''}`}>
      <button type="button" className="card__main" onClick={onOpen} aria-label={`${item.company}: ${item.title}`}>
        <div className="card__top">
          <div className="card__heading">
            <span className="card__company">
              {item.company}
              {item.is_new && <span className="new-dot">новое</span>}
            </span>
            <span className="card__title">{item.title}</span>
          </div>
          <MatchRing score={item.match.score} />
        </div>
        <div className="card__badges">
          <Badge tone={st.tone}>{st.text}</Badge>
          <Badge tone="neutral">{placeLabel(item)}</Badge>
          {salary && <Badge tone="neutral">{salary}</Badge>}
        </div>
        {item.match.reasons.length > 0 && <div className="card__reason">✓ {item.match.reasons.slice(0, 2).join(' · ')}</div>}
        {item.match.warnings.length > 0 && <div className="card__warn">! {item.match.warnings[0]}</div>}
        <div className="card__source">
          {item.source.name}
          {item.is_synthetic && <span className="demo-tag">демо-сроки</span>}
        </div>
      </button>
      <button
        type="button"
        className={`track-btn${item.tracked ? ' track-btn--on' : ''}`}
        onClick={onToggleTrack}
        aria-label={item.tracked ? 'Перестать отслеживать' : 'Отслеживать'}
        title={item.tracked ? 'Отслеживаю' : 'Отслеживать'}
      >
        {item.tracked ? '★' : '☆'}
      </button>
    </article>
  );
}

export function Toast({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="toast" role="status" aria-live="polite">
      {text}
    </div>
  );
}
