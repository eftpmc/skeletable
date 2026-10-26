/**
 * Fixed-window request counts per key (a client address), in memory. Enough for one server process;
 * signed-out searches spend source API quota, so each visitor gets a fair share.
 */
export class RateLimiter {
  private windows = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Count one request. Returns how many seconds to wait when over the limit, or null when allowed. */
  take(key: string): number | null {
    const now = this.now();
    const window = this.windows.get(key);
    if (!window || now - window.start >= this.windowMs) {
      if (this.windows.size > 10_000) this.prune(now);
      this.windows.set(key, { start: now, count: 1 });
      return null;
    }
    if (window.count >= this.limit) return Math.ceil((window.start + this.windowMs - now) / 1000);
    window.count++;
    return null;
  }

  private prune(now: number) {
    for (const [key, window] of this.windows) if (now - window.start >= this.windowMs) this.windows.delete(key);
  }
}
