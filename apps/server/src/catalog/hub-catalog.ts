import {
  CATALOG_FORMAT,
  catalogLineSchema,
  currencyDigits,
  unpackVector,
  type CatalogListing,
  type CatalogSource,
} from "@skeleton/formats";
import { catalogCategorySchema, departments } from "@skeleton/shared";
import { schema } from "@skeleton/db";
import { catalogRecordSchema, type CatalogRecord } from "./import.js";

const { PHOTO_DIMENSIONS } = schema;

// The photo model whose vectors the app's look search is built on (the hub's lab import).
const PHOTO_MODEL = "clip-vit-b-32";
const MAX_ITEMS = 500;

/**
 * Rough US dollar value of one unit of each currency, for showing and filtering prices in dollars.
 * Approximate and fixed (from the brand lab, 2026); good enough for "under $200", not for checkout.
 */
const USD: Record<string, number> = {
  USD: 1, CAD: 0.73, AUD: 0.66, NZD: 0.6, EUR: 1.08, GBP: 1.27, JPY: 0.0067, SEK: 0.095, DKK: 0.145, NOK: 0.094,
  CHF: 1.12, INR: 0.012, SGD: 0.74, HKD: 0.128, KRW: 0.00073, MXN: 0.055, ZAR: 0.055, PHP: 0.017, MYR: 0.21,
  IDR: 0.000063, BRL: 0.18, AED: 0.27, PLN: 0.25, CZK: 0.043, THB: 0.028, TWD: 0.031, ILS: 0.27, CNY: 0.14, TRY: 0.03,
  RON: 0.22, HUF: 0.0028, ISK: 0.0072, CLP: 0.0011, COP: 0.00025, ARS: 0.001, PEN: 0.27, VND: 0.00004, NGN: 0.00065,
  KES: 0.0077, SAR: 0.27, QAR: 0.27, EGP: 0.02, PKR: 0.0036, BGN: 0.55, UAH: 0.024,
};

/** A price in minor units of its currency, in US dollars to the cent; null for a currency we can't convert. */
export function usd(price: { amount: number; currency: string }): number | null {
  const rate = USD[price.currency];
  if (rate === undefined) return null;
  return Math.round((price.amount / 10 ** currencyDigits(price.currency)) * rate * 100) / 100;
}

const quartile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;

function mostCommon(values: (string | undefined)[]): string | undefined {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/** "maker-studio.co.uk" → "Maker Studio": a last resort when nothing names the store. */
const nameFromDomain = (domain: string) =>
  domain.split(".")[0]!.split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

export type HubCatalog = { buildId: string; records: CatalogRecord[]; skipped: Record<string, number> };

/**
 * Read the hub's catalog file (format 2) into the app's brand records: each source becomes a store
 * brand with its listings as items. The app shows a listing when it has a category it knows, a
 * photo vector for look search and a price it can put in dollars; the rest are counted, not shown.
 */
export function readHubCatalog(lines: string[]): HubCatalog {
  const parsed = lines.filter(Boolean).map((line, i) => {
    const result = catalogLineSchema.safeParse(JSON.parse(line));
    if (!result.success) throw new Error(`catalog line ${i + 1}: ${result.error.issues[0]?.path.join(".")} ${result.error.issues[0]?.message}`);
    return result.data;
  });
  const header = parsed[0];
  if (header?.type !== "header" || header.format !== CATALOG_FORMAT) throw new Error(`not a catalog file in format ${CATALOG_FORMAT}`);

  const skipped = { noVector: 0, noCategory: 0, noPrice: 0 };
  const groups: { source: CatalogSource; listings: CatalogListing[] }[] = [];
  for (const line of parsed.slice(1)) {
    if (line.type === "source") groups.push({ source: line, listings: [] });
    else if (line.type === "listing" && groups.at(-1)?.source.id === line.sourceId) groups.at(-1)!.listings.push(line);
  }

  const records = groups.flatMap(({ source, listings }) => {
    const items = listings
      // In stock first; the hub's order otherwise.
      .sort((a, b) => Number(b.available !== false) - Number(a.available !== false))
      .flatMap((l) => {
        const look = l.embeddings[PHOTO_MODEL];
        const category = catalogCategorySchema.safeParse(l.values.category);
        const priceUsd = l.price ? usd(l.price) : null;
        if (!look) return skipped.noVector++, [];
        if (!category.success) return skipped.noCategory++, [];
        if (priceUsd === null) return skipped.noPrice++, [];
        const image = l.images[0]!;
        const department = departments.find((d) => d === l.values.department) ?? "unisex";
        return [{
          imageUrl: image.url,
          imageWidth: image.width,
          imageHeight: image.height,
          title: l.title,
          priceUsd,
          productUrl: l.url,
          category: category.data,
          department,
          look,
        }];
      })
      .slice(0, MAX_ITEMS);
    if (!items.length) return [];

    const prices = items.map((i) => i.priceUsd).sort((a, b) => a - b);
    const sides = items.map((i) => i.department);
    const share = (side: string) => sides.filter((s) => s === side).length / sides.length;
    const mean = new Array<number>(PHOTO_DIMENSIONS).fill(0);
    for (const item of items) unpackVector(item.look).forEach((x, d) => (mean[d]! += x));
    const norm = Math.hypot(...mean) || 1;
    const v = source.values;
    return [catalogRecordSchema.parse({
      kind: "store",
      name: v.name ?? mostCommon(listings.map((l) => l.maker)) ?? nameFromDomain(source.domain),
      site: `https://${source.domain}`,
      platform: null,
      country: v.country ?? null,
      city: v.city ?? null,
      description: v.summary ?? null,
      priceLowUsd: Math.round(quartile(prices, 0.25)),
      priceHighUsd: Math.round(quartile(prices, 0.75)),
      // Unrated sources sit just above the bar until someone judges them.
      quality: v.quality ?? 0.5,
      seenAt: null,
      department: share("women") >= 0.8 ? "women" : share("men") >= 0.8 ? "men" : "both",
      look: mean.map((x) => x / norm),
      items,
    })];
  });
  return { buildId: header.buildId, records, skipped };
}
