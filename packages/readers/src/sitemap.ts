import zlib from "node:zlib";
import { parse } from "node-html-parser";
import type { SafeFetchOptions } from "./safe-fetch.js";
import { readStorefront, type StoreObservation } from "./storefront.js";

export type DiscoverySource = "shopify-feed" | "sitemap" | "links";
export type SitemapLimits = { maxSitemaps?: number; maxUrls?: number };

/** Paths that look like a single product on common platforms (Shopify, WooCommerce, BigCommerce, Magento, custom). */
const PRODUCT_PATH = /\/(?:products?|p|pdp|item|items|dp|shop\/[^/]+)\/[^/]+|-p-?\d+|\/\d{5,}\/?$/i;
/** Shopify `sitemap_products_1.xml`, WooCommerce `product-sitemap.xml`, BigCommerce `?type=products`, `prod-en-US_1.xml`, `seo-pdp-index.xml`. */
const PRODUCT_SITEMAP = /product|prod[-_]|pdp/i;
const NOT_PRODUCT = /\/(?:collections?|categor(?:y|ies)|cat|c|blogs?|pages?|search|cart|account|tags?|brands?)(?:\/|$)/i;

type Rule = { allow: boolean; pattern: string };
export type Robots = { sitemaps: string[]; rules: Rule[] };

/** The groups for `*` and our own bot. A crawler that honours them never reads a disallowed path. */
export function parseRobots(text: string, agent = "skeletonbot"): Robots {
  const sitemaps: string[] = [];
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  let current: { agents: string[]; rules: Rule[] } | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const match = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!match) continue;
    const key = match[1]!.toLowerCase();
    const value = match[2]!.trim();
    if (key === "sitemap") { if (value) sitemaps.push(value); continue; }
    if (key === "user-agent") {
      if (!current || current.rules.length) groups.push(current = { agents: [], rules: [] });
      current.agents.push(value.toLowerCase());
    } else if ((key === "allow" || key === "disallow") && current) {
      // An empty Disallow allows everything.
      if (value) current.rules.push({ allow: key === "allow", pattern: value });
    }
  }
  const own = groups.filter((g) => g.agents.some((a) => a !== "*" && agent.includes(a)));
  const chosen = own.length ? own : groups.filter((g) => g.agents.includes("*"));
  return { sitemaps, rules: chosen.flatMap((g) => g.rules) };
}

/** Longest matching rule wins; Allow wins a tie. Supports `*` and a trailing `$`. */
export function robotsAllows(robots: Robots, url: string): boolean {
  const { pathname, search } = new URL(url);
  const path = pathname + search;
  let best: Rule | null = null;
  for (const rule of robots.rules) {
    const anchored = rule.pattern.endsWith("$");
    const body = rule.pattern.slice(0, anchored ? -1 : undefined).split("*")
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
    if (!new RegExp(`^${body}${anchored ? "$" : ""}`).test(path)) continue;
    if (!best || rule.pattern.length > best.pattern.length || (rule.pattern.length === best.pattern.length && rule.allow)) best = rule;
  }
  return best?.allow ?? true;
}

export type SitemapEntry = { url: string; lastmod: string | null };
export type ParsedSitemap = { sitemaps: string[]; urls: SitemapEntry[] };

/** A regex scan rather than a DOM: product sitemaps run to tens of thousands of entries. */
export function parseSitemap(xml: string): ParsedSitemap {
  const entries = (pattern: RegExp) => [...xml.matchAll(pattern)].flatMap((match) => {
    const loc = field(match[1]!, /<loc>([\s\S]*?)<\/loc>/);
    return loc ? [{ url: decodeXml(loc), lastmod: field(match[1]!, /<lastmod>([\s\S]*?)<\/lastmod>/) }] : [];
  });
  return {
    sitemaps: entries(/<sitemap\b[^>]*>([\s\S]*?)<\/sitemap>/g).map((entry) => entry.url),
    urls: entries(/<url\b[^>]*>([\s\S]*?)<\/url>/g),
  };
}

function field(block: string, pattern: RegExp): string | null {
  const value = block.match(pattern)?.[1]?.replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, "").trim();
  return value || null;
}

/** `.xml.gz` sitemaps arrive as raw gzip bodies rather than a content-encoding. */
function sitemapText(body: Buffer, maxBytes: number): string {
  if (body[0] === 0x1f && body[1] === 0x8b) return zlib.gunzipSync(body, { maxOutputLength: maxBytes }).toString("utf8");
  return body.toString("utf8");
}

function decodeXml(value: string) {
  return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

export function looksLikeProduct(url: string, fromProductSitemap: boolean): boolean {
  const { pathname } = new URL(url);
  if (pathname === "/" || NOT_PRODUCT.test(pathname)) return false;
  return fromProductSitemap || PRODUCT_PATH.test(pathname);
}

export type SitemapDiscovery = {
  observation: StoreObservation;
  productUrls: string[];
  via: DiscoverySource | null;
  /** Bounded discoveries, never a complete inventory or deletion signal. */
  complete: false;
};

const stopped = (observation: StoreObservation): SitemapDiscovery => ({ observation, productUrls: [], via: null, complete: false });
const blocks = (observation: StoreObservation) => observation.state !== "open" && observation.state !== "unknown";

/**
 * Find product pages: Shopify's public feed when the store has one, then the sitemaps robots.txt
 * lists (or the usual `/sitemap.xml`), then links on the front page. Every request goes through
 * the store-state check: a password page, maintenance notice or rate limit stops discovery there.
 */
export async function discoverProducts(site: string, options: SafeFetchOptions = {}, limits: SitemapLimits = {}): Promise<SitemapDiscovery> {
  const { maxSitemaps = 8, maxUrls = 500 } = limits;
  // The sitemap protocol's own ceiling for one file.
  const maxBytes = options.maxBytes ?? 50 * 1024 * 1024;
  const front = await readStorefront(site, options);
  if (front.observation.state !== "open") return stopped(front.observation);
  const base = new URL(front.page.url);
  // An entry like `/us/en/` scopes discovery to that storefront, and prefers its locale's sitemaps.
  const scope = new URL(site).pathname.replace(/[^/]*$/, "");
  const locale = scope.split("/").filter((part) => /^[a-z]{2}(?:-[a-z]{2})?$/i.test(part)).flatMap((part) => part.toLowerCase().split("-"));
  const html = front.page.body.toString("utf8");
  const host = (url: URL) => url.hostname.replace(/^www\./, "");
  const sameSite = (url: URL) => host(url) === host(base) && !url.username && !url.password;

  const robotsRead = await readStorefront(new URL("/robots.txt", base).toString(), { ...options, accept: "text/plain" });
  if (blocks(robotsRead.observation)) return stopped(robotsRead.observation);
  const robots = robotsRead.observation.state === "open" ? parseRobots(robotsRead.page.body.toString("utf8")) : { sitemaps: [], rules: [] };
  const allowed = (url: URL) => sameSite(url) && robotsAllows(robots, url.toString());
  const finish = (urls: string[], via: DiscoverySource): SitemapDiscovery =>
    ({ observation: front.observation, productUrls: [...new Set(urls)].slice(0, maxUrls), via, complete: false });

  if (/cdn\.shopify\.com|Shopify\.shop|\/cdn\/shop\//.test(html)) {
    const feedUrl = new URL("/products.json?limit=250", base);
    if (robotsAllows(robots, feedUrl.toString())) {
      const feed = await readStorefront(feedUrl.toString(), { ...options, accept: "application/json" }).catch(() => null);
      if (feed && blocks(feed.observation)) return stopped(feed.observation);
      const handles = feed?.observation.state === "open" ? shopifyHandles(feed.page.body.toString("utf8")) : [];
      const urls = handles.map((handle) => new URL(`/products/${handle}`, base)).filter(allowed).map(String);
      if (urls.length) return finish(urls, "shopify-feed");
    }
  }

  // Product-named sitemaps first, so a large index spends its budget on products.
  const queue = robots.sitemaps.length ? robots.sitemaps : ["/sitemap.xml", "/sitemap_index.xml"];
  const pending = queue.flatMap((loc) => toUrl(loc, base)).filter(allowed);
  const seen = new Set<string>();
  const found: SitemapEntry[] = [];
  let fetched = 0;
  while (pending.length && fetched < maxSitemaps && found.length < maxUrls) {
    pending.sort((a, b) => sitemapScore(b, locale) - sitemapScore(a, locale));
    const next = pending.shift()!;
    if (seen.has(next.toString())) continue;
    seen.add(next.toString());
    fetched++;
    let read: Awaited<ReturnType<typeof readStorefront>>;
    // A sitemap too large or slow to read is skipped; the rest of the queue may still work.
    try { read = await readStorefront(next.toString(), { ...options, maxBytes, accept: "application/xml,text/xml" }); } catch { continue; }
    if (blocks(read.observation)) return stopped(read.observation);
    if (read.observation.state !== "open") continue;
    let sitemap: ParsedSitemap;
    try { sitemap = parseSitemap(sitemapText(read.page.body, maxBytes)); } catch { continue; }
    pending.push(...sitemap.sitemaps.flatMap((loc) => toUrl(loc, base)).filter(allowed));
    const productSitemap = PRODUCT_SITEMAP.test(next.pathname + next.search);
    for (const entry of sitemap.urls) {
      const url = toUrl(entry.url, base)[0];
      if (url && allowed(url) && url.pathname.startsWith(scope) && looksLikeProduct(url.toString(), productSitemap)) { url.hash = ""; found.push({ url: url.toString(), lastmod: entry.lastmod }); }
    }
  }
  // Recently changed pages first: old entries are often archived or redirected products.
  const recency = (entry: SitemapEntry) => (entry.lastmod && Date.parse(entry.lastmod)) || 0;
  if (found.length) return finish(found.sort((a, b) => recency(b) - recency(a)).map((entry) => entry.url), "sitemap");

  const links = parse(html).querySelectorAll("a[href]").flatMap((a) => toUrl(a.getAttribute("href")!, base))
    .filter((url) => allowed(url) && looksLikeProduct(url.toString(), false))
    .map((url) => { url.hash = ""; return url.toString(); });
  return finish(links, "links");
}

function sitemapScore(url: URL, locale: string[]) {
  const name = (url.pathname + url.search).toLowerCase();
  const tokens = name.split(/[^a-z]+/);
  return (PRODUCT_SITEMAP.test(name) ? 2 : 0) + (locale.length && locale.every((part) => tokens.includes(part)) ? 1 : 0);
}

function shopifyHandles(body: string): string[] {
  try {
    const data = JSON.parse(body) as { products?: { handle?: unknown }[] };
    if (!Array.isArray(data.products)) return [];
    return data.products.flatMap((p) => typeof p?.handle === "string" && /^[a-z0-9-]+$/i.test(p.handle) ? [p.handle] : []);
  } catch { return []; }
}

function toUrl(value: string, base: URL): URL[] {
  try {
    const url = new URL(value, base);
    return url.protocol === "http:" || url.protocol === "https:" ? [url] : [];
  } catch { return []; }
}
