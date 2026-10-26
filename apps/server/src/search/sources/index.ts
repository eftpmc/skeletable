import type { SourceInfo } from "@closet/shared";
import type { Config } from "../../config.js";
import { bestBuySource } from "./bestbuy.js";
import { ebaySource } from "./ebay.js";
import { parseShopifyStores, shopifySource } from "./shopify.js";
import type { Source } from "./types.js";

export type { RawOffer, Source, SourceContext, SourceQuery } from "./types.js";

/** Build the enabled sources from configuration, plus a description of all of them for settings. */
export function sourcesFromConfig(config: Config): { sources: Source[]; info: SourceInfo[] } {
  const sources: Source[] = [];
  const info: SourceInfo[] = [];

  const shops = parseShopifyStores(config.SHOPIFY_STORES);
  info.push({ id: "shopify", label: "Indie stores (Shopify)", enabled: shops.length > 0, needs: shops.length ? null : "SHOPIFY_STORES" });
  if (shops.length) sources.push(shopifySource(shops, { protocol: config.SHOPIFY_PROTOCOL }));

  const ebayReady = Boolean(config.EBAY_CLIENT_ID && config.EBAY_CLIENT_SECRET);
  info.push({ id: "ebay", label: "eBay", enabled: ebayReady, needs: ebayReady ? null : "EBAY_CLIENT_ID + EBAY_CLIENT_SECRET" });
  if (ebayReady) {
    sources.push(
      ebaySource({
        clientId: config.EBAY_CLIENT_ID!,
        clientSecret: config.EBAY_CLIENT_SECRET!,
        marketplace: config.EBAY_MARKETPLACE,
        apiBase: config.EBAY_API_BASE,
      }),
    );
  }

  info.push({ id: "bestbuy", label: "Best Buy", enabled: Boolean(config.BESTBUY_API_KEY), needs: config.BESTBUY_API_KEY ? null : "BESTBUY_API_KEY" });
  if (config.BESTBUY_API_KEY) sources.push(bestBuySource({ apiKey: config.BESTBUY_API_KEY, apiBase: config.BESTBUY_API_BASE }));

  return { sources, info };
}
