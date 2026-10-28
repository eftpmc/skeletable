import type { LinkPreview } from "@closet/shared";
import { parse } from "node-html-parser";
import { fetchLinkPreview } from "../../closet/link-preview.js";
import type { SafeFetchOptions } from "@closet/readers";
import { discoverProducts, type DiscoverySource } from "@closet/readers";
import { readStorefront, StoreUnavailableError, type StoreObservation } from "@closet/readers";

export type Discovery = {
  observation: StoreObservation;
  productUrls: string[];
  via?: DiscoverySource | null;
  /** These are bounded discoveries, never a complete inventory or deletion signal. */
  complete: false;
};
export type ProductRead =
  | { observation: StoreObservation; product: LinkPreview }
  | { observation: StoreObservation; product: null };

export interface StoreConnector {
  id: string;
  discover(site: string, options?: SafeFetchOptions): Promise<Discovery>;
  readProduct(url: string, options?: SafeFetchOptions): Promise<ProductRead>;
}

const failed = (): StoreObservation => ({
  state: "unavailable", checkedAt: new Date().toISOString(), reason: "Could not read the store",
});

async function readProduct(url: string, options: SafeFetchOptions = {}): Promise<ProductRead> {
  try {
    const product = await fetchLinkPreview(url, options);
    const observation: StoreObservation = {
      state: "open", checkedAt: new Date().toISOString(), reason: "Public page is accessible",
    };
    return { observation, product: product.title && product.priceCents !== null ? product : null };
  } catch (error) {
    return { observation: error instanceof StoreUnavailableError ? error.observation : failed(), product: null };
  }
}

/** Platform-independent JSON-LD/OpenGraph reader, with bounded same-origin link discovery. */
export const pageConnector: StoreConnector = {
  id: "page",
  readProduct,
  async discover(site, options = {}) {
    try {
      const { page, observation } = await readStorefront(site, options);
      if (observation.state !== "open") return { observation, productUrls: [], complete: false };
      const base = new URL(page.url);
      const urls = parse(page.body.toString("utf8")).querySelectorAll("a[href]").flatMap((a) => {
        try {
          const url = new URL(a.getAttribute("href")!, base);
          if (url.origin !== base.origin || url.username || url.password || !/\/(?:products?|p)\/[^/]+/i.test(url.pathname)) return [];
          url.hash = "";
          return [url.toString()];
        } catch { return []; }
      });
      return { observation, productUrls: [...new Set(urls)].slice(0, 100), complete: false };
    } catch {
      return { observation: failed(), productUrls: [], complete: false };
    }
  },
};

/** Public Shopify feed. Check the front door first; never query behind a password gate. */
export const shopifyConnector: StoreConnector = {
  id: "shopify",
  readProduct,
  async discover(site, options = {}) {
    try {
      const { page, observation } = await readStorefront(site, options);
      if (observation.state !== "open") return { observation, productUrls: [], complete: false };
      const feed = await readStorefront(new URL("/products.json?limit=250", page.url).toString(), options);
      if (feed.observation.state !== "open") return { observation: feed.observation, productUrls: [], complete: false };
      const data = JSON.parse(feed.page.body.toString("utf8")) as { products?: { handle?: unknown }[] };
      if (!Array.isArray(data.products)) throw new Error("Invalid product feed");
      const productUrls = data.products.flatMap((product) =>
        typeof product?.handle === "string" && /^[a-z0-9-]+$/i.test(product.handle)
          ? [new URL(`/products/${product.handle}`, page.url).toString()] : [],
      );
      return { observation, productUrls: [...new Set(productUrls)].slice(0, 250), complete: false };
    } catch {
      return { observation: failed(), productUrls: [], complete: false };
    }
  },
};

/**
 * General reader for any store: Shopify feed as a fast path, then robots.txt sitemaps, then
 * front-page links; products are read from schema.org JSON-LD/microdata, OpenGraph and Shopify JSON.
 */
export const sitemapConnector: StoreConnector = {
  id: "sitemap",
  readProduct,
  async discover(site, options = {}) {
    try {
      return await discoverProducts(site, options);
    } catch {
      return { observation: failed(), productUrls: [], complete: false };
    }
  },
};

export const connectors: Record<string, StoreConnector> = { page: pageConnector, shopify: shopifyConnector, sitemap: sitemapConnector };

export type ProductSnapshot = {
  observation: StoreObservation;
  product: LinkPreview | null;
  lastSuccessfulAt: string | null;
};

/** Failed/closed reads retain the old price and product timestamp. No stock events are inferred. */
export function reconcileProduct(previous: ProductSnapshot | null, read: ProductRead): ProductSnapshot {
  const fresh = read.observation.state === "open" && read.product !== null;
  return {
    observation: read.observation,
    product: fresh ? read.product : previous?.product ?? null,
    lastSuccessfulAt: fresh ? read.observation.checkedAt : previous?.lastSuccessfulAt ?? null,
  };
}
