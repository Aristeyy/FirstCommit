import { MaxUI } from '@maxhub/max-ui';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, login, type Filters, type Internship, type Meta, type Profile } from './api';
import { bridge } from './bridge';
import { ErrorState, Loading, Toast } from './components';
import { shortDateTime } from './format';
import { Detail } from './screens/Detail';
import { DEFAULT_FILTERS, Feed } from './screens/Feed';
import { ProfileScreen, Tracked } from './screens/Tracked';

type Tab = 'feed' | 'tracked' | 'profile';

function useColorScheme(): 'light' | 'dark' {
  const q = window.matchMedia?.('(prefers-color-scheme: dark)');
  const [dark, setDark] = useState(!!q?.matches);
  useEffect(() => {
    const h = (e: MediaQueryListEvent) => setDark(e.matches);
    q?.addEventListener?.('change', h);
    return () => q?.removeEventListener?.('change', h);
  }, [q]);
  return dark ? 'dark' : 'light';
}

export default function App() {
  const scheme = useColorScheme();
  const [boot, setBoot] = useState<'loading' | 'ready' | 'error'>('loading');
  const [bootError, setBootError] = useState('');
  const [devMode, setDevMode] = useState(false);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tab, setTab] = useState<Tab>('feed');
  const [detailId, setDetailId] = useState<number | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [reloadKey, setReloadKey] = useState(0);
  const [toastText, setToastText] = useState<string | null>(null);

  const toast = useCallback((t: string) => {
    setToastText(t);
    setTimeout(() => setToastText(null), 2200);
  }, []);

  const start = useCallback(async () => {
    setBoot('loading');
    try {
      bridge.ready();
      const [auth, m] = await Promise.all([login(), api.meta()]);
      setMeta(m);
      setProfile(auth.profile);
      setDevMode(auth.dev);
      const sp = auth.start_param ?? bridge.startParam;
      if (sp && /^i\d+$/.test(sp)) setDetailId(Number(sp.slice(1)));
      else if (sp === 'tracked') setTab('tracked');
      if (!auth.profile.onboarded) setTab('profile');
      setBoot('ready');
    } catch (e) {
      setBootError(e instanceof ApiError ? e.message : 'Сервис временно недоступен');
      setBoot('error');
    }
  }, []);

  useEffect(() => {
    void start();
  }, [start]);

  useEffect(() => bridge.backButton(detailId !== null ? () => setDetailId(null) : null), [detailId]);

  const toggleTrack = useCallback(
    async (item: Internship): Promise<boolean> => {
      try {
        await api.track(item.id, !item.tracked);
        bridge.haptic('success');
        toast(item.tracked ? 'Больше не отслеживаю' : 'Напомню о дедлайне в чате ⭐');
        return true;
      } catch (e) {
        bridge.haptic('error');
        toast(e instanceof ApiError ? e.message : 'Не удалось сохранить');
        return false;
      }
    },
    [toast],
  );

  const openDetail = (id: number) => {
    bridge.haptic('select');
    setDetailId(id);
    window.scrollTo({ top: 0 });
  };

  let content;
  if (boot === 'loading') content = <Loading text="Входим через MAX…" />;
  else if (boot === 'error') content = <ErrorState message={bootError} onRetry={start} />;
  else if (detailId !== null)
    content = (
      <>
        <button type="button" className="back-link" onClick={() => { setDetailId(null); setReloadKey((k) => k + 1); }}>
          ← Назад
        </button>
        <Detail id={detailId} onToggleTrack={toggleTrack} toast={toast} />
      </>
    );
  else if (tab === 'feed')
    content = <Feed meta={meta} filters={filters} setFilters={setFilters} onOpen={openDetail} onToggleTrack={toggleTrack} reloadKey={reloadKey} />;
  else if (tab === 'tracked')
    content = <Tracked onOpen={openDetail} onToggleTrack={toggleTrack} onBrowse={() => setTab('feed')} reloadKey={reloadKey} />;
  else
    content = (
      <ProfileScreen
        meta={meta}
        profile={profile!}
        firstRun={!profile!.onboarded}
        onSaved={(p) => {
          setProfile(p);
          setTab('feed');
          setReloadKey((k) => k + 1);
          toast('Профиль сохранён — подборка обновлена');
        }}
      />
    );

  return (
    <MaxUI platform={bridge.platform} colorScheme={scheme}>
      <div className="app">
        {devMode && <div className="dev-banner">Режим отладки вне MAX: демо-пользователь</div>}
        <header className="app__header">
          <div className="brand">
            <span className="brand__logo" aria-hidden>{'</>'}</span>
            <div>
              <div className="brand__name">Первый коммит</div>
              <div className="brand__sub">стажировки в IT без пропущенных дедлайнов</div>
            </div>
          </div>
        </header>

        {boot === 'ready' && detailId === null && (
          <nav className="tabs" role="tablist">
            {(
              [
                ['feed', 'Подборка'],
                ['tracked', 'Отслеживаю'],
                ['profile', 'Профиль'],
              ] as const
            ).map(([t, l]) => (
              <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => { bridge.haptic('select'); setTab(t); }}>
                {l}
              </button>
            ))}
          </nav>
        )}

        <main className="app__main">{content}</main>

        {boot === 'ready' && detailId === null && tab === 'feed' && meta && (
          <footer className="sources">
            <div className="sources__title">Источники данных</div>
            {meta.sources.map((s) => (
              <div key={s.id} className="sources__row">
                <span>
                  {s.name}
                  {s.kind === 'curated' && ' (демо-сроки)'}
                  {s.mode === 'offline' && ' (снимок)'}
                </span>
                <span className="muted">
                  {s.items} · {s.updated_at ? shortDateTime(s.updated_at) : 'нет данных'}
                </span>
              </div>
            ))}
          </footer>
        )}
        <Toast text={toastText} />
      </div>
    </MaxUI>
  );
}
