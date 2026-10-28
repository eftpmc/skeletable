import type { SourceInfo } from "@skeleton/shared";
import type { Config } from "../../config.js";
import { bestBuySource } from "./bestbuy.js";
import { ebaySource } from "./ebay.js";
import { type ShopifyStore, parseShopifyStores, shopifySource } from "./shopify.js";
import type { Source } from "./types.js";

export type { RawOffer, Source, SourceContext, SourceQuery } from "./types.js";

/** Everything needed to build the search sources, whether it came from the environment or the admin page. */
export type StoreSetup = {
  shops: ShopifyStore[];
  ebay: { clientId: string; clientSecret: string; marketplace: string; apiBase?: string } | null;
  bestbuy: { apiKey: string; apiBase?: string } | null;
  protocol: "https" | "http";
};

/** The store setup the environment describes. The admin page adds to it (see admin/stores.ts). */
export function setupFromConfig(config: Config): StoreSetup {
  return {
    shops: parseShopifyStores(config.SHOPIFY_STORES),
    ebay:
      config.EBAY_CLIENT_ID && config.EBAY_CLIENT_SECRET
        ? { clientId: config.EBAY_CLIENT_ID, clientSecret: config.EBAY_CLIENT_SECRET, marketplace: config.EBAY_MARKETPLACE, apiBase: config.EBAY_API_BASE }
        : null,
    bestbuy: config.BESTBUY_API_KEY ? { apiKey: config.BESTBUY_API_KEY, apiBase: config.BESTBUY_API_BASE } : null,
    protocol: config.SHOPIFY_PROTOCOL,
  };
}

/** Build the enabled sources, plus a description of all of them for people choosing what to search. */
export function buildSources(setup: StoreSetup): { sources: Source[]; info: SourceInfo[] } {
  const sources: Source[] = [];
  const info: SourceInfo[] = [];
  const { shops, ebay, bestbuy } = setup;

  info.push({ id: "shopify", label: "Indie stores (Shopify)", enabled: shops.length > 0, needs: shops.length ? null : "Shopify stores" });
  if (shops.length) sources.push(shopifySource(shops, { protocol: setup.protocol }));

  info.push({ id: "ebay", label: "eBay", enabled: Boolean(ebay), needs: ebay ? null : "eBay API keys" });
  if (ebay) sources.push(ebaySource(ebay));

  info.push({ id: "bestbuy", label: "Best Buy", enabled: Boolean(bestbuy), needs: bestbuy ? null : "a Best Buy API key" });
  if (bestbuy) sources.push(bestBuySource(bestbuy));

  return { sources, info };
}

/** Build the enabled sources from configuration alone. */
export function sourcesFromConfig(config: Config): { sources: Source[]; info: SourceInfo[] } {
  return buildSources(setupFromConfig(config));
}
