import type { Context, MiddlewareHandler } from "hono";

const WINDOW_MS = 60_000;

/** Railway's proxy sets this to the visitor's address. Requests with no address share one allowance. */
const visitor = (c: Context) => c.req.header("x-real-ip") ?? "unknown";

/**
 * Lets each visitor make `limit` requests a minute, counted in this one process, so several
 * servers would each allow that many. Counts reset together, which keeps memory small.
 */
export function rateLimit(limit: number, now: () => number = Date.now): MiddlewareHandler {
  let counts = new Map<string, number>();
  let windowEnds = 0;
  return async (c, next) => {
    const time = now();
    if (time >= windowEnds) {
      counts = new Map();
      windowEnds = time + WINDOW_MS;
    }
    const key = visitor(c);
    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    if (count > limit) {
      c.header("Retry-After", String(Math.ceil((windowEnds - time) / 1000)));
      return c.json({ error: "Too many requests. Try again in a minute." }, 429);
    }
    await next();
  };
}
