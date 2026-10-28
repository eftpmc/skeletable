import { FetchError, parseRobots, robotsAllows, safeFetch, type Robots, type SafeFetchOptions } from "@skeleton/readers";
import type { ReadContext } from "../readers/index.js";

export class RobotsBlocked extends Error {
  constructor(readonly url: string) {
    super(`robots.txt disallows ${url}`);
  }
}

export type PoliteOptions = {
  // Time between two requests to the same site.
  pauseMs?: number;
  // Waits before asking a busy site again, when it doesn't say how long; one retry per entry.
  backoffMs?: number[];
  fetch?: SafeFetchOptions;
  sleep?: (ms: number) => Promise<void>;
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * The only way readers reach a site: robots.txt is read once and honoured for every request,
 * requests go one at a time with a pause between, and the safe fetcher refuses private addresses.
 */
export async function politeContext(origin: URL, options: PoliteOptions = {}): Promise<ReadContext & { requests: () => number }> {
  const { pauseMs = 2000, backoffMs = [10_000, 30_000], sleep = wait } = options;
  let requests = 0;
  let last = 0;
  const once = async (url: string, accept?: string) => {
    const due = last + pauseMs - Date.now();
    if (requests > 0 && due > 0) await sleep(due);
    requests++;
    try {
      return await safeFetch(url, { timeoutMs: 20_000, ...options.fetch, accept, allowHttpErrors: true });
    } finally {
      last = Date.now();
    }
  };
  // A site that says "slow down" (429) or "busy" (503) is asked again after a wait. Shopify answers
  // a feed's first request with 429 and "Retry-After: 60" yet serves it seconds later, so the first
  // retry waits at most the first backoff step; after that the site gets the full wait it asks for.
  const get = async (url: string, accept?: string) => {
    for (let attempt = 0; ; attempt++) {
      const response = await once(url, accept);
      if (response.status < 400) return response;
      const busy = response.status === 429 || response.status === 503;
      if (!busy || attempt >= backoffMs.length) throw new FetchError(`Request failed with status ${response.status}`, "http_error", response.status);
      const asked = Number(response.retryAfter);
      const fallback = backoffMs[attempt]!;
      const wanted = Number.isFinite(asked) && asked > 0 ? Math.min(asked * 1000, 60_000) : fallback;
      await sleep(attempt === 0 ? Math.min(wanted, fallback) : wanted);
    }
  };

  let robots: Robots = { sitemaps: [], rules: [] };
  try {
    robots = parseRobots((await get(new URL("/robots.txt", origin).toString(), "text/plain")).body.toString("utf8"));
  } catch {
    // No robots.txt (or none we can read) means no rules.
  }

  return {
    requests: () => requests,
    async fetch(url, accept) {
      if (!robotsAllows(robots, url)) throw new RobotsBlocked(url);
      return get(url, accept);
    },
  };
}
