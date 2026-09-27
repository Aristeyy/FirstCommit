/**
 * Тонкая типизированная обёртка над MAX Bridge (window.WebApp).
 * Вне MAX (обычный браузер) все вызовы безопасно деградируют.
 */
interface WebAppLike {
  initData?: string;
  initDataUnsafe?: { start_param?: string; user?: { id: number; first_name?: string } };
  platform?: string | null;
  ready?: () => void;
  expand?: () => void;
  openLink?: (url: string) => void;
  shareContent?: (p: { text?: string; link?: string }) => Promise<unknown>;
  BackButton?: { show: () => void; hide: () => void; onClick: (cb: () => void) => void; offClick: (cb: () => void) => void };
  HapticFeedback?: {
    impactOccurred?: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notificationOccurred?: (type: 'success' | 'warning' | 'error') => void;
    selectionChanged?: () => void;
  };
}

const wa = (): WebAppLike | undefined => (window as unknown as { WebApp?: WebAppLike }).WebApp;

export const bridge = {
  /** Мы внутри MAX, если Bridge передал подписанный initData. */
  get inMax(): boolean {
    return !!wa()?.initData;
  },
  get initData(): string {
    return wa()?.initData ?? '';
  },
  get startParam(): string | null {
    const fromBridge = wa()?.initDataUnsafe?.start_param;
    if (fromBridge) return fromBridge;
    // Для отладки в браузере: ?startapp=i12
    return new URLSearchParams(location.search).get('startapp');
  },
  get platform(): 'ios' | 'android' {
    return wa()?.platform === 'ios' ? 'ios' : 'android';
  },
  ready() {
    try {
      wa()?.ready?.();
      wa()?.expand?.();
    } catch {
      /* вне MAX */
    }
  },
  openLink(url: string) {
    const w = wa();
    if (w?.openLink) w.openLink(url);
    else window.open(url, '_blank', 'noopener');
  },
  async share(text: string, link: string): Promise<'shared' | 'copied' | 'failed'> {
    const w = wa();
    try {
      if (w?.shareContent) {
        await w.shareContent({ text, link });
        return 'shared';
      }
      if (navigator.share) {
        await navigator.share({ text, url: link });
        return 'shared';
      }
      await navigator.clipboard.writeText(`${text}\n${link}`);
      return 'copied';
    } catch {
      return 'failed';
    }
  },
  haptic(kind: 'success' | 'error' | 'light' | 'select') {
    const h = wa()?.HapticFeedback;
    try {
      if (kind === 'success' || kind === 'error') h?.notificationOccurred?.(kind);
      else if (kind === 'select') h?.selectionChanged?.();
      else h?.impactOccurred?.('light');
    } catch {
      /* вне MAX */
    }
  },
  backButton(handler: (() => void) | null) {
    const b = wa()?.BackButton;
    if (!b) return () => undefined;
    if (!handler) {
      b.hide();
      return () => undefined;
    }
    b.onClick(handler);
    b.show();
    return () => {
      b.offClick(handler);
      b.hide();
    };
  },
};
