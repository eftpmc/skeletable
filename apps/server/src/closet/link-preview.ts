import type { LinkPreview } from "@closet/shared";
import { type HTMLElement, parse } from "node-html-parser";
import { type SafeFetchOptions, safeFetch } from "../net/safe-fetch.js";
import { normalizeGtin } from "../search/normalize.js";
import { guessCategory, parseColorNames } from "./guess.js";
import { readStorefront, StoreUnavailableError } from "../catalog/connectors/storefront.js";
import { extractRecipe } from "../catalog/connectors/recipes.js";
import { reviewedRecipeFor } from "../catalog/connectors/reviewed-recipes.js";

type PageData = Omit<LinkPreview, "category" | "colors" | "url"> & { color: string | null; category: string | null };

/** Read product details from a store page: JSON-LD first, then OpenGraph, then Shopify's product JSON. */
export async function fetchLinkPreview(url: string, fetchOptions: SafeFetchOptions = {}): Promise<LinkPreview> {
  const { page, observation } = await readStorefront(url, { ...fetchOptions, accept: "text/html,application/xhtml+xml" });
  if (observation.state !== "open") throw new StoreUnavailableError(observation);
  const html = page.body.toString("utf8");
  const preview = parseProductPage(html, page.url);
  const recipe = reviewedRecipeFor(page.url);
  if (recipe && preview.priceCents === null) {
    const recovered = extractRecipe(html, page.url, recipe).product;
    if (recovered) {
      preview.title = recovered.title;
      preview.priceCents = recovered.priceCents;
      preview.currency = recovered.currency;
    }
  }

  if (isShopify(html) && (!preview.brand || preview.images.length === 0 || preview.priceCents === null)) {
    const shopify = await fetchShopifyProduct(page.url, fetchOptions);
    if (shopify) {
      preview.title ??= shopify.title;
      preview.brand ??= shopify.brand;
      preview.priceCents ??= shopify.priceCents;
      if (preview.images.length === 0) preview.images = shopify.images;
      preview.category ??= guessCategory(shopify.productType, shopify.title);
    }
  }

  return preview;
}

export function parseProductPage(html: string, pageUrl: string): LinkPreview {
  const root = parse(html);
  const fromJsonLd = readJsonLd(root, pageUrl);
  const fromMeta = readMeta(root, pageUrl);

  const siteName = fromMeta.siteName;
  const brand = fromJsonLd.brand ?? fromMeta.brand;
  const rawTitle = fromJsonLd.title ?? fromMeta.title ?? root.querySelector("title")?.text ?? null;
  const title = rawTitle ? cleanTitle(rawTitle, [siteName, brand]) : null;
  const images = unique([...fromJsonLd.images, ...fromMeta.images]).slice(0, 8);
  const colorText = fromJsonLd.color ?? fromMeta.color;

  return {
    url: pageUrl,
    title,
    brand,
    priceCents: fromJsonLd.priceCents ?? fromMeta.priceCents,
    currency: fromJsonLd.currency ?? fromMeta.currency,
    images,
    category: guessCategory(fromJsonLd.category, title),
    colors: parseColorNames(colorText ?? title),
    siteName,
    gtin: fromJsonLd.gtin,
    mpn: fromJsonLd.mpn,
  };
}

function readJsonLd(root: HTMLElement, pageUrl: string): PageData {
  const result: PageData = empty();
  for (const script of root.querySelectorAll('script[type="application/ld+json"]')) {
    let data: unknown;
    try {
      data = JSON.parse(script.text);
    } catch {
      continue;
    }
    const product = findProduct(data);
    if (!product) continue;

    result.title ??= text(product.name);
    result.brand ??= text(isRecord(product.brand) ? product.brand.name : product.brand);
    result.color ??= text(product.color);
    result.category ??= text(product.category);
    result.gtin ??= normalizeGtin(product.gtin13 ?? product.gtin12 ?? product.gtin14 ?? product.gtin8 ?? product.gtin);
    result.mpn ??= text(product.mpn);
    result.images.push(...imageUrls(product.image, pageUrl));

    const variants = Array.isArray(product.hasVariant) ? product.hasVariant.filter(isRecord) : [];
    for (const variant of variants) result.images.push(...imageUrls(variant.image, pageUrl));

    const offer = firstOffer(product.offers) ?? variants.map((variant) => firstOffer(variant.offers)).find(Boolean);
    if (offer && result.priceCents === null) {
      result.priceCents = toCents(offer.price ?? offer.lowPrice);
      result.currency = text(offer.priceCurrency);
    }
  }
  return result;
}

function readMeta(root: HTMLElement, pageUrl: string): PageData {
  const meta = (name: string) =>
    root.querySelectorAll(`meta[property="${name}"], meta[name="${name}"]`).map((el) => el.getAttribute("content") ?? "");
  const first = (...names: string[]) => {
    for (const name of names) {
      const value = meta(name).find((content) => content.trim());
      if (value) return decodeEntities(value.trim());
    }
    return null;
  };

  return {
    title: first("og:title", "twitter:title"),
    brand: first("product:brand", "og:brand"),
    siteName: first("og:site_name", "application-name"),
    priceCents: toCents(first("product:price:amount", "og:price:amount")),
    currency: first("product:price:currency", "og:price:currency"),
    images: [...meta("og:image:secure_url"), ...meta("og:image"), ...meta("twitter:image")]
      .flatMap((src) => imageUrls(src, pageUrl)),
    color: first("product:color"),
    category: null,
    gtin: null,
    mpn: null,
  };
}

type ShopifyProduct = { title: string; brand: string | null; priceCents: number | null; images: string[]; productType: string | null };

async function fetchShopifyProduct(pageUrl: string, fetchOptions: SafeFetchOptions): Promise<ShopifyProduct | null> {
  const url = new URL(pageUrl);
  const match = url.pathname.match(/^(.*\/products\/[^/]+)\/?$/);
  if (!match) return null;
  url.pathname = `${match[1]}.js`;
  url.search = "";
  try {
    const response = await safeFetch(url.toString(), { ...fetchOptions, accept: "application/json" });
    const data = JSON.parse(response.body.toString("utf8")) as Record<string, unknown>;
    return {
      title: String(data.title ?? ""),
      brand: text(data.vendor),
      // Shopify's product JSON reports prices in cents.
      priceCents: typeof data.price === "number" ? data.price : null,
      images: imageUrls(data.images, pageUrl),
      productType: text(data.type),
    };
  } catch {
    return null;
  }
}

function isShopify(html: string) {
  return html.includes("cdn.shopify.com") || html.includes("Shopify.shop");
}

type JsonRecord = Record<string, unknown>;

function findProduct(data: unknown, depth = 0): JsonRecord | null {
  if (depth > 6) return null;
  if (Array.isArray(data)) {
    for (const entry of data) {
      const found = findProduct(entry, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(data)) return null;
  const types = ([] as unknown[]).concat(data["@type"] ?? []).map(String);
  if (types.some((type) => type === "Product" || type === "ProductGroup" || type.endsWith("/Product"))) return data;
  if (data["@graph"]) return findProduct(data["@graph"], depth + 1);
  if (data.mainEntity) return findProduct(data.mainEntity, depth + 1);
  return null;
}

function firstOffer(offers: unknown): JsonRecord | null {
  if (Array.isArray(offers)) return offers.find(isRecord) ?? null;
  if (!isRecord(offers)) return null;
  if (Array.isArray(offers.offers)) return firstOffer(offers.offers) ?? offers;
  return offers;
}

function imageUrls(value: unknown, base: string): string[] {
  const raw = ([] as unknown[]).concat(value ?? []);
  const urls: string[] = [];
  for (const entry of raw) {
    const src = typeof entry === "string" ? entry : isRecord(entry) ? (entry.url ?? entry.contentUrl ?? entry.src) : null;
    if (typeof src !== "string" || !src.trim()) continue;
    try {
      const url = new URL(decodeEntities(src.trim()), base);
      if (url.protocol === "http:" || url.protocol === "https:") urls.push(url.toString());
    } catch {
      // Ignore malformed image URLs.
    }
  }
  return urls;
}

function toCents(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number.parseFloat(String(value).replace(/[^0-9.]/g, ""));
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) : null;
}

function cleanTitle(title: string, suffixes: (string | null)[]) {
  let result = decodeEntities(title).replace(/\s+/g, " ").trim();
  for (const suffix of suffixes) {
    if (!suffix) continue;
    const escaped = suffix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`\\s*[|–—-]\\s*${escaped}\\s*$`, "i"), "").trim();
  }
  return result || title.trim();
}

function text(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return decodeEntities(value.trim());
  if (Array.isArray(value)) return text(value[0]);
  return null;
}

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function empty(): PageData {
  return { title: null, brand: null, siteName: null, priceCents: null, currency: null, images: [], color: null, category: null, gtin: null, mpn: null };
}
