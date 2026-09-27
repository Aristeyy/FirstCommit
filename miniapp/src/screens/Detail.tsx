import { Button, Typography } from '@maxhub/max-ui';
import { useEffect, useState } from 'react';
import { api, ApiError, type Internship } from '../api';
import { bridge } from '../bridge';
import { Badge, ErrorState, Loading, MatchRing } from '../components';
import { humanDate, placeLabel, salaryLabel, shortDateTime, statusBadge } from '../format';

interface Props {
  id: number;
  onToggleTrack: (item: Internship) => Promise<boolean>;
  toast: (t: string) => void;
}

export function Detail({ id, onToggleTrack, toast }: Props) {
  const [item, setItem] = useState<Internship | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setError(null);
    try {
      setItem(await api.item(id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Неизвестная ошибка');
    }
  };
  useEffect(() => {
    setItem(null);
    void load();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!item) return <Loading />;

  const st = statusBadge(item);
  const salary = salaryLabel(item);

  const track = async () => {
    setBusy(true);
    const ok = await onToggleTrack(item);
    if (ok) setItem({ ...item, tracked: !item.tracked });
    setBusy(false);
  };

  const share = async () => {
    const r = await bridge.share(`${item.company} — ${item.title}. Нашёл в «Первом коммите»`, item.apply_url);
    if (r === 'copied') toast('Ссылка скопирована');
    if (r === 'failed') toast('Не удалось поделиться');
  };

  const timeline = [
    item.opens_at && { label: 'Старт набора', date: item.opens_at, done: item.status !== 'soon' },
    item.deadline && { label: 'Дедлайн заявки', date: item.deadline, done: item.status === 'closed' },
    item.starts_at && { label: 'Начало стажировки', date: item.starts_at, done: false },
  ].filter(Boolean) as { label: string; date: string; done: boolean }[];

  return (
    <div className="detail">
      <div className="detail__head">
        <div>
          <div className="card__company">{item.company}</div>
          <Typography.Title variant="large-strong" className="detail__title">
            {item.title}
          </Typography.Title>
        </div>
        <MatchRing score={item.match.score} />
      </div>

      <div className="card__badges">
        <Badge tone={st.tone}>{st.text}</Badge>
        <Badge tone="neutral">{placeLabel(item)}</Badge>
        {salary && <Badge tone="neutral">{salary}</Badge>}
        {item.duration && <Badge tone="neutral">{item.duration}</Badge>}
      </div>

      {item.active === false && <div className="note note--warn">Источник больше не публикует эту позицию.</div>}

      {(item.match.reasons.length > 0 || item.match.warnings.length > 0) && (
        <section className="section">
          <h3>Почему подходит</h3>
          <ul className="reasons">
            {item.match.reasons.map((r) => (
              <li key={r} className="ok">✓ {r}</li>
            ))}
            {item.match.warnings.map((w) => (
              <li key={w} className="warn">! {w}</li>
            ))}
          </ul>
          <p className="hint">Оценка считается по профилю: направление, стек, курс и город. Это подсказка, а не решение работодателя.</p>
        </section>
      )}

      {timeline.length > 0 && (
        <section className="section">
          <h3>Сроки</h3>
          <ol className="timeline">
            {timeline.map((t) => (
              <li key={t.label} className={t.done ? 'done' : ''}>
                <span>{t.label}</span>
                <b>{humanDate(t.date)}</b>
              </li>
            ))}
          </ol>
        </section>
      )}

      {item.summary && (
        <section className="section">
          <h3>О стажировке</h3>
          <p>{item.summary}</p>
        </section>
      )}

      {item.stack.length > 0 && (
        <section className="section">
          <h3>Стек</h3>
          <div className="chips-wrap">
            {item.stack.map((s) => (
              <span key={s} className="chip chip--static">{s}</span>
            ))}
          </div>
        </section>
      )}

      {item.requirements.length > 0 && (
        <section className="section">
          <h3>Требования</h3>
          <ul className="plain">
            {item.requirements.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>
      )}

      {item.stages.length > 0 && (
        <section className="section">
          <h3>Этапы отбора</h3>
          <ol className="plain">
            {item.stages.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </section>
      )}

      <section className="section source">
        <h3>Источник</h3>
        <p>
          {item.source.name} · обновлено {shortDateTime(item.fetched_at)}
          {item.published_at && ` · опубликовано ${humanDate(item.published_at)}`}
        </p>
        {item.data_note && <div className={`note${item.is_synthetic ? ' note--demo' : ''}`}>{item.data_note}</div>}
      </section>

      <div className="detail__actions">
        <Button size="large" stretched disabled={item.status === 'closed'} onClick={() => bridge.openLink(item.apply_url)}>
          {item.status === 'closed' ? 'Набор завершён' : item.status === 'soon' ? 'Открыть сайт программы' : 'Подать заявку на сайте'}
        </Button>
        <div className="detail__row">
          <Button variant={item.tracked ? 'primary' : 'secondary'} stretched loading={busy} onClick={track}>
            {item.tracked ? '★ Отслеживаю' : '☆ Напомнить о дедлайне'}
          </Button>
          <Button variant="secondary" onClick={share} aria-label="Поделиться">
            ↗
          </Button>
        </div>
      </div>
    </div>
  );
}
