export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  take(key: string, now = Date.now()): boolean {
    const cur = this.hits.get(key);
    if (!cur || cur.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      if (this.hits.size > 10_000) this.sweep(now);
      return true;
    }
    cur.count += 1;
    return cur.count <= this.limit;
  }

  retryAfterSec(key: string, now = Date.now()): number {
    const cur = this.hits.get(key);
    return cur ? Math.max(1, Math.ceil((cur.resetAt - now) / 1000)) : 1;
  }

  private sweep(now: number) {
    for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
  }
}
