import { safeFetch } from "@skeleton/readers";
import { dollarsToCents, normalizeGtin, parseCondition, tokens } from "../normalize.js";
import type { RawOffer, Source } from "./types.js";

type BestBuyProduct = {
  name?: string;
  url?: string;
  salePrice?: number;
  regularPrice?: number;
  image?: string;
  upc?: string;
  manufacturer?: string;
  modelNumber?: string;
  condition?: string;
  onlineAvailability?: boolean;
};

/** Best Buy Products API (needs a free API key). */
export function bestBuySource(options: { apiKey: string; apiBase?: string }): Source {
  const apiBase = options.apiBase ?? "https://api.bestbuy.com";
  return {
    id: "bestbuy",
    label: "Best Buy",
    async search(query, ctx) {
      // Best Buy's query language: products((search=word&search=word)&salePrice<=300)
      const words = tokens(query.text).slice(0, 8).map((word) => `search=${encodeURIComponent(word)}`);
      if (words.length === 0) return [];
      const clauses = [`(${words.join("&")})`];
      if (query.maxPriceCents) clauses.push(`salePrice<=${(query.maxPriceCents / 100).toFixed(2)}`);
      if (query.condition === "new") clauses.push("condition=new");
      if (query.condition === "refurb") clauses.push("condition=refurbished");
      if (query.condition === "used") clauses.push("condition=pre-owned");
      const params = new URLSearchParams({
        apiKey: options.apiKey,
        format: "json",
        pageSize: String(Math.min(query.limit, 30)),
        show: "name,url,salePrice,regularPrice,image,upc,manufacturer,modelNumber,condition,onlineAvailability",
      });
      const url = `${apiBase}/v1/products(${clauses.join("&")})?${params}`;
      const response = await safeFetch(url, { ...ctx.fetchOptions, accept: "application/json" });
      const data = JSON.parse(response.body.toString("utf8")) as { products?: BestBuyProduct[] };
      return (data.products ?? []).flatMap((item): RawOffer[] => {
        const priceCents = dollarsToCents(item.salePrice ?? item.regularPrice);
        if (!item.name || !item.url || priceCents === null) return [];
        return [
          {
            source: "bestbuy",
            store: { name: "Best Buy", domain: "bestbuy.com" },
            url: item.url,
            title: item.name,
            brand: item.manufacturer ?? null,
            priceCents,
            currency: "USD",
            condition: parseCondition(item.condition),
            imageUrl: item.image ?? null,
            gtin: normalizeGtin(item.upc),
            mpn: item.modelNumber ?? null,
            inStock: item.onlineAvailability ?? true,
          },
        ];
      });
    },
  };
}
