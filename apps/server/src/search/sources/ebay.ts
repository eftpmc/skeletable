import type { Condition } from "@skeleton/shared";
import { safeFetch } from "@skeleton/engine";
import { dollarsToCents, normalizeGtin } from "../normalize.js";
import type { RawOffer, Source } from "./types.js";

export type EbayOptions = {
  clientId: string;
  clientSecret: string;
  marketplace: string;
  /** Overridable for eBay's sandbox and for tests. */
  apiBase?: string;
};

type ItemSummary = {
  title?: string;
  itemWebUrl?: string;
  price?: { value?: string; currency?: string };
  conditionId?: string;
  condition?: string;
  image?: { imageUrl?: string };
  thumbnailImages?: { imageUrl?: string }[];
  brand?: string;
  gtin?: string;
  mpn?: string;
};

// eBay condition IDs: 1000–1750 new, 2000–2500 refurbished, 2750+ used.
function ebayCondition(id: string | undefined): Condition {
  const value = Number(id);
  if (value >= 2000 && value <= 2500) return "refurb";
  if (value >= 2750) return "used";
  return "new";
}

const conditionFilter: Record<Condition, string> = {
  new: "conditionIds:{1000|1500|1750}",
  refurb: "conditionIds:{2000|2010|2020|2030|2500}",
  used: "conditionIds:{2750|3000|4000|5000|6000}",
};

/** eBay Browse API (needs a free developer app: client ID + secret). */
export function ebaySource(options: EbayOptions): Source {
  const apiBase = options.apiBase ?? "https://api.ebay.com";
  let token: { value: string; expiresAt: number } | null = null;

  async function accessToken(fetchOptions: Parameters<typeof safeFetch>[1]) {
    if (token && token.expiresAt > Date.now() + 60_000) return token.value;
    const credentials = Buffer.from(`${options.clientId}:${options.clientSecret}`).toString("base64");
    const response = await safeFetch(`${apiBase}/identity/v1/oauth2/token`, {
      ...fetchOptions,
      method: "POST",
      accept: "application/json",
      headers: { authorization: `Basic ${credentials}`, "content-type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
    });
    const data = JSON.parse(response.body.toString("utf8")) as { access_token: string; expires_in: number };
    token = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    return token.value;
  }

  return {
    id: "ebay",
    label: "eBay",
    async search(query, ctx) {
      const url = new URL(`${apiBase}/buy/browse/v1/item_summary/search`);
      url.searchParams.set("q", query.text);
      url.searchParams.set("limit", String(Math.min(query.limit, 50)));
      const filters = ["buyingOptions:{FIXED_PRICE}"];
      if (query.condition) filters.push(conditionFilter[query.condition]);
      if (query.maxPriceCents) filters.push(`price:[..${(query.maxPriceCents / 100).toFixed(2)}]`, "priceCurrency:USD");
      url.searchParams.set("filter", filters.join(","));

      const response = await safeFetch(url.toString(), {
        ...ctx.fetchOptions,
        accept: "application/json",
        headers: {
          authorization: `Bearer ${await accessToken(ctx.fetchOptions)}`,
          "x-ebay-c-marketplace-id": options.marketplace,
        },
      });
      const data = JSON.parse(response.body.toString("utf8")) as { itemSummaries?: ItemSummary[] };
      return (data.itemSummaries ?? []).flatMap((item): RawOffer[] => {
        const priceCents = dollarsToCents(item.price?.value);
        if (!item.title || !item.itemWebUrl || priceCents === null) return [];
        return [
          {
            source: "ebay",
            store: { name: "eBay", domain: "ebay.com" },
            url: item.itemWebUrl,
            title: item.title,
            brand: item.brand ?? null,
            priceCents,
            currency: item.price?.currency ?? "USD",
            condition: ebayCondition(item.conditionId),
            imageUrl: item.image?.imageUrl ?? item.thumbnailImages?.[0]?.imageUrl ?? null,
            gtin: normalizeGtin(item.gtin),
            mpn: item.mpn ?? null,
            inStock: true,
          },
        ];
      });
    },
  };
}
