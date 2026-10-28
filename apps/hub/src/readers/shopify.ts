import { toMinorUnits, type ReadingInput } from "@skeleton/formats";
import { FetchError } from "@skeleton/readers";
import { parse } from "node-html-parser";
import { z } from "zod";
import type { Reader } from "./types.js";

// Pages of 250; a store whose page is too large to fetch is read in smaller pages instead. Each size
// divides the one before, so the listings already read line up with the smaller pages.
const PAGE_SIZES = [250, 50, 10];
// Shopify stops paging its public feed somewhere past this; 5,000 listings covers nearly every store.
const MAX_LISTINGS = 5000;

const variantSchema = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  title: z.string().nullish(),
  option1: z.string().nullish(),
  option2: z.string().nullish(),
  option3: z.string().nullish(),
  sku: z.string().nullish(),
  price: z.union([z.string(), z.number()]).nullish(),
  compare_at_price: z.union([z.string(), z.number()]).nullish(),
  available: z.boolean().nullish(),
});

/** One product as Shopify's public /products.json gives it. Only what we read is checked. */
export const shopifyProductSchema = z.object({
  id: z.union([z.number(), z.string()]),
  title: z.string(),
  handle: z.string(),
  body_html: z.string().nullish(),
  vendor: z.string().nullish(),
  product_type: z.string().nullish(),
  tags: z.union([z.array(z.string()), z.string()]).nullish(),
  published_at: z.string().nullish(),
  updated_at: z.string().nullish(),
  options: z.array(z.object({ name: z.string() })).nullish(),
  variants: z.array(variantSchema).nullish(),
  images: z.array(z.object({ src: z.string(), width: z.number().nullish(), height: z.number().nullish(), alt: z.string().nullish() })).nullish(),
});
export type ShopifyProduct = z.infer<typeof shopifyProductSchema>;

const https = (src: string) => (src.startsWith("//") ? `https:${src}` : src);
const present = (value: string | null | undefined) => (value && value.trim() ? value.trim() : undefined);
const iso = (value: string | null | undefined) => (value && !Number.isNaN(Date.parse(value)) ? value : undefined);

/** A Shopify product as a reading. Without the store's currency, prices are left out rather than guessed. */
export function shopifyReading(product: ShopifyProduct, origin: URL, currency: string | null): ReadingInput {
  const variants = product.variants ?? [];
  const optionNames = (product.options ?? []).map((o) => o.name);
  // Shopify prices are decimals in the store's currency; without the currency they mean nothing.
  const minor = (price: string | number | null | undefined) =>
    price === null || price === undefined || !currency ? undefined : toMinorUnits(price, currency);
  const money = (amount: number | undefined) => (amount === undefined || !currency ? undefined : { amount, currency });
  const prices = variants.map((v) => minor(v.price)).filter((p): p is number => p !== undefined);
  const compareAt = variants.map((v) => minor(v.compare_at_price)).filter((p): p is number => p !== undefined && p > 0);
  const lowest = prices.length ? Math.min(...prices) : undefined;
  const wasPrice = compareAt.length ? Math.min(...compareAt) : undefined;
  const description = product.body_html ? parse(product.body_html).text.replace(/\s+/g, " ").trim() : "";
  const tags = Array.isArray(product.tags) ? product.tags : (product.tags ?? "").split(",");
  return {
    externalId: String(product.id),
    url: new URL(`/products/${product.handle}`, origin).toString(),
    title: product.title.trim(),
    description: description ? description.slice(0, 20_000) : undefined,
    maker: present(product.vendor),
    productType: present(product.product_type),
    tags: tags.map((t) => t.trim()).filter(Boolean).slice(0, 200),
    price: money(lowest),
    compareAt: wasPrice !== undefined && lowest !== undefined && wasPrice > lowest ? money(wasPrice) : undefined,
    available: variants.length ? variants.some((v) => v.available) : undefined,
    images: (product.images ?? []).slice(0, 50).map((image) => ({
      url: https(image.src),
      width: image.width ?? undefined,
      height: image.height ?? undefined,
      alt: present(image.alt),
    })),
    variants: variants.slice(0, 500).map((v) => {
      const values = [v.option1, v.option2, v.option3];
      const options = Object.fromEntries(optionNames.flatMap((name, i) => (values[i] ? [[name, values[i]]] : [])));
      return {
        externalId: v.id === undefined ? undefined : String(v.id),
        title: present(v.title) ?? "Default",
        options: Object.keys(options).length ? options : undefined,
        price: money(minor(v.price)),
        available: v.available ?? undefined,
        sku: present(v.sku),
      };
    }),
    publishedAt: iso(product.published_at),
    updatedAt: iso(product.updated_at),
  };
}

/** Shopify stores, read through their public products feed, a page of 250 at a time (smaller when a page is too large). */
export const shopifyReader: Reader = {
  id: "shopify",
  version: 1,

  async detect(origin, ctx) {
    let feed;
    try {
      feed = await ctx.fetch(new URL("/products.json?limit=1", origin).toString(), "application/json");
    } catch {
      return null;
    }
    const products = (JSON.parse(feed.body.toString("utf8")) as { products?: unknown }).products;
    if (!Array.isArray(products)) return null;
    return { evidence: { feed: "/products.json" }, config: { currency: await storeCurrency(origin, ctx) } };
  },

  async *read(origin, config, ctx) {
    const currency = typeof config?.currency === "string" ? config.currency : await storeCurrency(origin, ctx);
    let size = 0;
    let read = 0;
    while (read < MAX_LISTINGS) {
      let feed;
      try {
        feed = await ctx.fetch(new URL(`/products.json?limit=${PAGE_SIZES[size]}&page=${read / PAGE_SIZES[size]! + 1}`, origin).toString(), "application/json");
      } catch (error) {
        if (error instanceof FetchError && error.code === "too_large" && size < PAGE_SIZES.length - 1) {
          size++;
          continue;
        }
        throw error;
      }
      const products = (JSON.parse(feed.body.toString("utf8")) as { products?: unknown[] }).products ?? [];
      for (const raw of products) {
        const product = shopifyProductSchema.safeParse(raw);
        if (product.success) yield shopifyReading(product.data, origin, currency);
      }
      read += products.length;
      if (products.length < PAGE_SIZES[size]!) return;
    }
  },
};

/**
 * The currency a store prices in, as its front page declares it to its own scripts; null when it
 * doesn't. (Not /cart.js: Shopify's robots.txt disallows /cart.)
 */
async function storeCurrency(origin: URL, ctx: Parameters<Reader["detect"]>[1]): Promise<string | null> {
  try {
    const page = (await ctx.fetch(new URL("/", origin).toString(), "text/html")).body.toString("utf8");
    const found = page.match(/Shopify\.currency\s*=\s*\{\s*"active"\s*:\s*"([A-Z]{3})"/) ?? page.match(/"currency"\s*:\s*"([A-Z]{3})"/);
    return found?.[1] ?? null;
  } catch {
    return null;
  }
}
