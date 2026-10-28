import { parseRobots, parseSitemap } from "@skeleton/readers";
import type { ReadContext } from "./types.js";

// Sitemap files one walk reads at most: a big shop's index points to dozens.
const MAX_SITEMAPS = 12;
const PRODUCT_SITEMAP = /product|prod[-_]|pdp/i;

/**
 * Pages a site lists in its sitemaps that `accept` keeps, product sitemaps first. Starts from the
 * sitemaps robots.txt names (or `start` when given), else the usual /sitemap.xml and /sitemap_index.xml,
 * and follows index files on the same host.
 */
export async function sitemapPages(
  origin: URL,
  ctx: ReadContext,
  accept: (url: URL, fromProductSitemap: boolean) => boolean,
  options: { max: number; start?: string },
): Promise<string[]> {
  let queue: string[];
  if (options.start) queue = [new URL(options.start, origin).toString()];
  else {
    let named: string[] = [];
    try {
      named = parseRobots((await ctx.fetch(new URL("/robots.txt", origin).toString(), "text/plain")).body.toString("utf8")).sitemaps;
    } catch {
      // No robots.txt: the usual places.
    }
    queue = named.length ? named : ["/sitemap.xml", "/sitemap_index.xml"].map((p) => new URL(p, origin).toString());
  }
  const sameHost = (u: string) => {
    try {
      return new URL(u).host === origin.host;
    } catch {
      return false;
    }
  };
  queue = queue.filter(sameHost);
  const found = new Set<string>();
  const seen = new Set<string>();
  while (queue.length && seen.size < MAX_SITEMAPS && found.size < options.max) {
    // Product sitemaps first: a big site's index lists pages, posts and collections too.
    queue.sort((a, b) => Number(PRODUCT_SITEMAP.test(b)) - Number(PRODUCT_SITEMAP.test(a)));
    const next = queue.shift()!;
    if (seen.has(next)) continue;
    seen.add(next);
    let sitemap;
    try {
      sitemap = parseSitemap((await ctx.fetch(next, "application/xml")).body.toString("utf8"));
    } catch {
      continue;
    }
    queue.push(...sitemap.sitemaps.filter((s) => sameHost(s) && !seen.has(s)));
    const fromProducts = PRODUCT_SITEMAP.test(next);
    for (const entry of sitemap.urls) {
      if (!sameHost(entry.url)) continue;
      const url = new URL(entry.url);
      if (accept(url, fromProducts)) found.add(url.toString());
      if (found.size >= options.max) break;
    }
  }
  return [...found];
}
