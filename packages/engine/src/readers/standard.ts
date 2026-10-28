import type { ReadingInput } from "@skeleton/formats";
import { looksLikeProduct } from "../sitemap.js";
import { parse, type HTMLElement } from "node-html-parser";
import { parsePrice } from "./recipe.js";
import { linkPages } from "./link-pages.js";
import { sitemapPages } from "./sitemap-pages.js";
import type { ReadContext, Reader } from "./types.js";

// Product pages one crawl reads at most, at the engine's pace; candidates a detection or sample tries.
const MAX_PAGES = 1000;
const MAX_TRIES = 12;

type Json = Record<string, unknown>;

const asArray = <T>(value: T | T[] | undefined | null): T[] => (value === undefined || value === null ? [] : Array.isArray(value) ? value : [value]);
const str = (value: unknown): string | undefined => {
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim() || undefined;
  if (typeof value === "number") return String(value);
  return undefined;
};
const types = (node: Json) => asArray(node["@type"] as string | string[]).map((t) => String(t).replace(/^.*[/#]/, ""));
const name = (value: unknown) => (value && typeof value === "object" ? str((value as Json).name) : str(value));
const imageUrl = (value: unknown): string | undefined => {
  const first = asArray(value as unknown[])[0];
  return first && typeof first === "object" ? str((first as Json).url ?? (first as Json).contentUrl) : str(first);
};
const gtinOf = (node: Json) => {
  for (const key of ["gtin13", "gtin12", "gtin14", "gtin8", "gtin"]) {
    const value = str(node[key])?.replace(/\D/g, "");
    if (value && /^\d{8}$|^\d{12,14}$/.test(value)) return value;
  }
  return undefined;
};

/** Every JSON-LD node on a page, flattened out of arrays and @graph. */
function jsonLd(root: HTMLElement): Json[] {
  const nodes: Json[] = [];
  const walk = (value: unknown) => {
    for (const item of asArray(value)) {
      if (!item || typeof item !== "object") continue;
      nodes.push(item as Json);
      if ((item as Json)["@graph"]) walk((item as Json)["@graph"]);
    }
  };
  for (const script of root.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      walk(JSON.parse(script.text));
    } catch {
      // A broken block of structured data is skipped, not fatal.
    }
  }
  return nodes;
}

type Offer = { price?: number; currency?: string; available?: boolean; url?: string };

function offerOf(node: Json): Offer {
  const offers = asArray(node.offers as Json | Json[]).filter((o) => o && typeof o === "object");
  for (const offer of offers) {
    const spec = asArray(offer.priceSpecification as Json | Json[])[0];
    const currency = str(offer.priceCurrency ?? spec?.priceCurrency)?.toUpperCase();
    const raw = str(offer.price ?? offer.lowPrice ?? spec?.price);
    const price = currency && /^[A-Z]{3}$/.test(currency) && raw ? parsePrice(raw, currency) : undefined;
    const availability = str(offer.availability)?.replace(/^.*[/#]/, "");
    if (price !== undefined)
      return {
        price,
        currency,
        available: availability ? /InStock|LimitedAvailability|OnlineOnly|PreOrder|BackOrder/i.test(availability) : undefined,
        url: str(offer.url),
      };
  }
  return {};
}

/**
 * A product page read from the data it publishes for search engines: schema.org Product (or a
 * ProductGroup and its variants) in JSON-LD, then Open Graph and product meta tags for what's missing.
 * Null when the page isn't a product or lacks a title, price, currency or photo.
 */
export function readStructured(html: string, pageUrl: string): ReadingInput | null {
  const root = parse(html);
  const url = new URL(pageUrl);
  const nodes = jsonLd(root);
  const group = nodes.find((n) => types(n).includes("ProductGroup"));
  const product = group ?? nodes.find((n) => types(n).includes("Product"));
  const meta = (key: string) => str(root.querySelector(`meta[property="${key}"]`)?.getAttribute("content") ?? root.querySelector(`meta[name="${key}"]`)?.getAttribute("content"));

  const variants = asArray(group?.hasVariant as Json | Json[]).filter((v) => v && typeof v === "object" && types(v).includes("Product"));
  const offered = [product, ...variants].filter((n): n is Json => Boolean(n)).map((n) => ({ node: n, offer: offerOf(n) }));
  const priced = offered.filter((o) => o.offer.price !== undefined);
  const cheapest = priced.sort((a, b) => a.offer.price! - b.offer.price!)[0]?.offer;

  const currency = cheapest?.currency ?? meta("product:price:currency")?.toUpperCase() ?? meta("og:price:currency")?.toUpperCase();
  const rawPrice = meta("product:price:amount") ?? meta("og:price:amount");
  const price = cheapest?.price ?? (rawPrice && currency ? parsePrice(rawPrice, currency) : undefined);
  const title = str(product?.name) ?? meta("og:title");
  const image = imageUrl(product?.image) ?? imageUrl(variants[0]?.image) ?? meta("og:image");
  if (!title || price === undefined || !currency || !/^[A-Z]{3}$/.test(currency) || !image) return null;

  let photo: string;
  try {
    photo = new URL(image, url).toString();
  } catch {
    return null;
  }
  const canonical = root.querySelector('link[rel="canonical"]')?.getAttribute("href");
  let path = url.pathname;
  try {
    if (canonical && new URL(canonical, url).host === url.host) path = new URL(canonical, url).pathname;
  } catch {
    // A canonical link that isn't a URL is ignored.
  }
  const available = offered.some((o) => o.offer.available === true) ? true : offered.every((o) => o.offer.available === false) && offered.length ? false : undefined;
  const description = str(product?.description) ?? meta("og:description");
  return {
    externalId: path,
    url: `${url.origin}${path}`,
    title: title.slice(0, 500),
    description: description?.slice(0, 20_000),
    maker: name(product?.brand)?.slice(0, 200) ?? name(product?.manufacturer)?.slice(0, 200),
    productType: str(product?.category)?.slice(0, 200),
    price: { amount: price, currency },
    available,
    images: [{ url: photo }],
    variants: variants.slice(0, 500).flatMap((v) => {
      const title = str(v.name) ?? str(v.sku);
      if (!title) return [];
      const offer = offerOf(v);
      return [
        {
          externalId: str(v.sku) ?? str(v["@id"]),
          title: title.slice(0, 300),
          price: offer.price !== undefined && offer.currency ? { amount: offer.price, currency: offer.currency } : undefined,
          available: offer.available,
          sku: str(v.sku)?.slice(0, 200),
          gtin: gtinOf(v),
        },
      ];
    }),
    identifiers: product ? { gtin: gtinOf(product), mpn: str(product.mpn)?.slice(0, 100), sku: str(product.sku)?.slice(0, 200) } : undefined,
  };
}

// Fewer product pages than this in the sitemaps, and the shop's own links are followed as well.
const ENOUGH_FROM_SITEMAPS = 5;

/** Product pages: the ones the site's sitemaps list, else the ones its own links lead to. */
async function productPages(origin: URL, ctx: ReadContext, max: number): Promise<string[]> {
  const listed = await sitemapPages(origin, ctx, (url, fromProducts) => looksLikeProduct(url.toString(), fromProducts), { max });
  if (listed.length >= ENOUGH_FROM_SITEMAPS) return listed;
  return [...new Set([...listed, ...(await linkPages(origin, ctx, max))])].slice(0, max);
}

async function readPage(url: string, ctx: ReadContext) {
  try {
    return readStructured((await ctx.fetch(url, "text/html")).body.toString("utf8"), url);
  } catch {
    return null;
  }
}

/**
 * Any shop that publishes structured product data for search engines, which most do whatever they're
 * built on: product pages found in its sitemaps (or by following its own links), each read from its
 * own schema.org data.
 */
export const standardReader: Reader = {
  id: "standard",
  version: 1,

  async detect(origin, ctx) {
    const candidates = await productPages(origin, ctx, 200);
    for (const page of spread(candidates, MAX_TRIES)) {
      if (await readPage(page, ctx)) return { evidence: { structuredData: page, productPages: candidates.length } };
    }
    return null;
  },

  async *read(origin, _config, ctx) {
    for (const page of await productPages(origin, ctx, MAX_PAGES)) {
      const reading = await readPage(page, ctx);
      if (reading) yield reading;
    }
  },

  async sample(origin, _config, ctx, n) {
    const candidates = await productPages(origin, ctx, 200);
    const pages = [];
    for (const page of spread(candidates, Math.max(n, MAX_TRIES))) {
      const reading = await readPage(page, ctx);
      pages.push({ url: page, reading, issues: reading ? [] : ["no product data with a title, price, currency and photo on this page"] });
      if (pages.filter((p) => p.reading).length >= n) break;
    }
    return { pagesFound: candidates.length, pages };
  },
};

/** Up to n items spread through a list, rather than its first few. */
export function spread<T>(items: T[], n: number): T[] {
  if (items.length <= n) return items;
  return Array.from({ length: n }, (_, i) => items[Math.floor((i * items.length) / n)]!);
}
