import { Button, Switch, Typography } from '@maxhub/max-ui';
import { useEffect, useState } from 'react';
import { api, ApiError, type Internship, type Meta, type Profile } from '../api';
import { Chip, EmptyState, ErrorState, InternshipCard, Loading } from '../components';
import { COURSES } from '../format';

export function Tracked({ onOpen, onToggleTrack, onBrowse, reloadKey }: {
  onOpen: (id: number) => void;
  onToggleTrack: (item: Internship) => Promise<boolean>;
  onBrowse: () => void;
  reloadKey: number;
}) {
  const [items, setItems] = useState<Internship[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    setError(null);
    try {
      setItems((await api.tracked()).items);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Неизвестная ошибка');
    }
  };
  useEffect(() => {
    void load();
  }, [reloadKey]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!items) return <Loading />;
  if (items.length === 0)
    return (
      <EmptyState
        title="Пока ничего не отслеживаете"
        text="Нажмите ☆ на карточке — бот напомнит в чате за 7, 3 и 1 день до дедлайна."
        action={<Button onClick={onBrowse}>Перейти к подборке</Button>}
      />
    );
  const order = { open: 0, soon: 1, rolling: 2, closed: 3 } as const;
  const sorted = [...items].sort((a, b) => order[a.status] - order[b.status] || (a.days_left ?? 999) - (b.days_left ?? 999));
  return (
    <div className="list">
      <p className="hint">Напоминания о дедлайнах приходят в чат с ботом.</p>
      {sorted.map((it) => (
        <InternshipCard
          key={it.id}
          item={it}
          onOpen={() => onOpen(it.id)}
          onToggleTrack={async () => {
            if (await onToggleTrack(it)) setItems(items.filter((x) => x.id !== it.id));
          }}
        />
      ))}
    </div>
  );
}

export function ProfileScreen({ meta, profile, onSaved, firstRun }: {
  meta: Meta | null;
  profile: Profile;
  onSaved: (p: Profile) => void;
  firstRun: boolean;
}) {
  const [p, setP] = useState<Profile>(profile);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const saved = await api.saveProfile({
        directions: p.directions,
        stack: p.stack,
        course: p.course,
        city: p.city || null,
        formats: p.formats,
        paid_only: p.paid_only,
        notify: p.notify,
      });
      onSaved(saved);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  if (!meta) return <Loading />;
  return (
    <div className="profile">
      <Typography.Title variant="medium-strong">{firstRun ? 'Расскажите о себе — подберём стажировки' : 'Мой профиль'}</Typography.Title>
      <p className="hint">Профиль нужен только для сортировки подборки. Мы не просим ФИО, телефон и резюме.</p>

      <div className="field-label">Направления</div>
      <div className="chips-wrap">
        {meta.directions.filter((d) => d.id !== 'other').map((d) => (
          <Chip key={d.id} active={p.directions.includes(d.id)} onClick={() => setP({ ...p, directions: toggle(p.directions, d.id) })}>
            {d.emoji} {d.label}
          </Chip>
        ))}
      </div>

      <div className="field-label">Что уже умею (стек)</div>
      <div className="chips-wrap">
        {meta.stack.map((s) => (
          <Chip key={s} active={p.stack.includes(s)} onClick={() => setP({ ...p, stack: toggle(p.stack, s) })}>
            {s}
          </Chip>
        ))}
      </div>

      <div className="field-label">Курс</div>
      <div className="chips-wrap">
        {COURSES.map((c) => (
          <Chip key={c.value} active={p.course === c.value} onClick={() => setP({ ...p, course: p.course === c.value ? null : c.value })}>
            {c.label}
          </Chip>
        ))}
      </div>

      <div className="field-label">Город</div>
      <div className="chips-wrap">
        <Chip active={!p.city} onClick={() => setP({ ...p, city: null })}>
          Не важно
        </Chip>
        {meta.cities.slice(0, 10).map((c) => (
          <Chip key={c} active={p.city === c} onClick={() => setP({ ...p, city: c })}>
            {c}
          </Chip>
        ))}
      </div>

      <div className="field-label">Формат</div>
      <div className="chips-wrap">
        {meta.formats.map((f) => (
          <Chip key={f.id} active={p.formats.includes(f.id)} onClick={() => setP({ ...p, formats: toggle(p.formats, f.id) })}>
            {f.label}
          </Chip>
        ))}
      </div>

      <label className="switch-row">
        <span>Только оплачиваемые</span>
        <Switch checked={p.paid_only} onChange={(e) => setP({ ...p, paid_only: e.target.checked })} />
      </label>
      <label className="switch-row">
        <span>Напоминания и новые подборки в чате</span>
        <Switch checked={p.notify} onChange={(e) => setP({ ...p, notify: e.target.checked })} />
      </label>

      {error && <div className="note note--warn">{error}</div>}
      <div className="sheet__actions">
        <Button size="large" stretched loading={saving} onClick={save}>
          {firstRun ? 'Показать стажировки' : 'Сохранить'}
        </Button>
      </div>
    </div>
  );
}
