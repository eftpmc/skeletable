import type { Context, MiddlewareHandler } from "hono";

/**
 * At most `max` requests per key in each window, counted in memory: the hub runs as one process, and a
 * restart forgetting the counts is harmless. Over the limit, a 429 says when to come back.
 */
export function rateLimit(options: { windowMs: number; max: number; key: (c: Context) => string }): MiddlewareHandler {
  const windows = new Map<string, { start: number; count: number }>();
  return async (c, next) => {
    const now = Date.now();
    const key = options.key(c);
    let window = windows.get(key);
    if (!window || now - window.start >= options.windowMs) {
      window = { start: now, count: 0 };
      windows.set(key, window);
      // Forget windows that ended, now and then, so the map can't grow without bound.
      if (windows.size > 10_000) for (const [k, w] of windows) if (now - w.start >= options.windowMs) windows.delete(k);
    }
    if (++window.count > options.max) {
      c.header("retry-after", String(Math.ceil((window.start + options.windowMs - now) / 1000)));
      return c.json({ error: "too many requests" }, 429);
    }
    await next();
  };
}

/**
 * The caller's address as the proxy in front of the hub (Railway's) saw it: its X-Real-IP, else the
 * last X-Forwarded-For hop, which is the one the proxy added (earlier hops are whatever the caller sent).
 */
export const clientAddress = (c: Context) =>
  c.req.header("x-real-ip")?.trim() || c.req.header("x-forwarded-for")?.split(",").at(-1)?.trim() || "unknown";
