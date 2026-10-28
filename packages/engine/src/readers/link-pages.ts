import { looksLikeProduct } from "../sitemap.js";
import { parse } from "node-html-parser";
import { sameSite } from "./sitemap-pages.js";
import type { ReadContext } from "./types.js";

// Listing pages (home, collections, categories) one walk reads at most, at the engine's pace.
const MAX_LISTINGS = 20;
// Paths that list products rather than being one: where to look for more product links.
const LISTING = /\/(?:collections?|categor(?:y|ies)|c|shop|store|products?|catalog|women|womens|men|mens|new|all|sale|clothing|home|objects?|accessories)(?:\/|$|-)/i;
// Never worth a request: accounts, carts, search, files.
const SKIP = /\/(?:account|login|cart|checkout|search|wishlist|cdn|assets|static)(?:\/|$)|\.(?:jpe?g|png|webp|gif|svg|pdf|css|js|xml|json)$/i;

/**
 * Product pages found by following the shop's own links, for sites with no (useful) sitemap: from the
 * home page through collection and category pages, keeping links that look like products.
 */
export async function linkPages(origin: URL, ctx: ReadContext, max: number): Promise<string[]> {
  const products = new Set<string>();
  const listings = [origin.toString()];
  const seen = new Set<string>();
  while (listings.length && seen.size < MAX_LISTINGS && products.size < max) {
    const next = listings.shift()!;
    if (seen.has(next)) continue;
    seen.add(next);
    let html: string;
    try {
      html = (await ctx.fetch(next, "text/html")).body.toString("utf8");
    } catch {
      continue;
    }
    for (const a of parse(html).querySelectorAll("a[href]")) {
      let url: URL;
      try {
        url = new URL(a.getAttribute("href")!, next);
      } catch {
        continue;
      }
      if (!/^https?:$/.test(url.protocol) || !sameSite(url, origin) || SKIP.test(url.pathname)) continue;
      url.hash = "";
      url.search = "";
      const href = url.toString();
      if (looksLikeProduct(href, false)) products.add(href);
      else if (LISTING.test(url.pathname) && !seen.has(href) && !listings.includes(href)) listings.push(href);
      if (products.size >= max) break;
    }
  }
  return [...products];
}
