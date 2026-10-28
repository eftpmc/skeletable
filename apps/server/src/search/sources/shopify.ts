import { safeFetch } from "@closet/readers";
import { dollarsToCents, parseCondition } from "../normalize.js";
import type { RawOffer, Source } from "./types.js";

export type ShopifyStore = { domain: string; name: string; condition: "new" | "used"; currency: string };

/**
 * Parse SHOPIFY_STORES: comma-separated entries of `domain`, optionally with
 * `|used` for secondhand shops, `|EUR`-style currency and `|name=Shop Name`,
 * e.g. "shop.example.com|used|name=Second Spin".
 */
export function parseShopifyStores(value: string | undefined): ShopifyStore[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [domain = "", ...flags] = entry.split("|").map((part) => part.trim());
      const currency = flags.find((flag) => /^[A-Z]{3}$/.test(flag)) ?? "USD";
      const named = flags.find((flag) => flag.startsWith("name="))?.slice(5).trim();
      const guessed = domain.replace(/^www\./, "").split(".")[0] ?? domain;
      return {
        domain: domain.replace(/^https?:\/\//, "").replace(/\/.*$/, ""),
        name: named || guessed.charAt(0).toUpperCase() + guessed.slice(1),
        condition: flags.includes("used") ? "used" : "new",
        currency,
      } as ShopifyStore;
    });
}

type PredictiveProduct = {
  title?: string;
  url?: string;
  price?: string | number;
  image?: string;
  featured_image?: { url?: string };
  vendor?: string;
  available?: boolean;
  tags?: string[];
};

/** Searches Shopify stores through their public predictive search endpoint. */
export function shopifySource(stores: ShopifyStore[], options: { protocol?: "https" | "http" } = {}): Source {
  const protocol = options.protocol ?? "https";
  return {
    id: "shopify",
    label: stores.length === 1 ? stores[0]!.name : `${stores.length} indie stores`,
    async search(query, ctx) {
      const perStore = await Promise.allSettled(
        stores.map(async (shop) => {
          const url = new URL(`${protocol}://${shop.domain}/search/suggest.json`);
          url.searchParams.set("q", query.text);
          url.searchParams.set("resources[type]", "product");
          url.searchParams.set("resources[limit]", String(Math.min(query.limit, 10)));
          const response = await safeFetch(url.toString(), { ...ctx.fetchOptions, accept: "application/json", timeoutMs: 6000 });
          const data = JSON.parse(response.body.toString("utf8")) as {
            resources?: { results?: { products?: PredictiveProduct[] } };
          };
          const products = data.resources?.results?.products;
          if (!Array.isArray(products)) throw new Error("Store did not return product search results");
          return products.flatMap((item): RawOffer[] => {
            const priceCents = dollarsToCents(item.price);
            if (!item.title || !item.url || priceCents === null) return [];
            const productUrl = new URL(item.url, `${protocol}://${shop.domain}`);
            productUrl.search = "";
            const image = item.image ?? item.featured_image?.url ?? null;
            return [
              {
                source: "shopify",
                store: { name: shop.name, domain: shop.domain },
                url: productUrl.toString(),
                title: item.title,
                brand: item.vendor ?? null,
                priceCents,
                currency: shop.currency,
                condition: shop.condition === "used" ? "used" : parseCondition(item.tags?.join(" ")),
                imageUrl: image ? new URL(image, `${protocol}://${shop.domain}`).toString() : null,
                gtin: null,
                mpn: null,
                inStock: item.available ?? true,
              },
            ];
          });
        }),
      );
      if (perStore.length > 0 && perStore.every((result) => result.status === "rejected")) {
        throw new Error("No Shopify stores answered this search");
      }
      return perStore.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
    },
  };
}
