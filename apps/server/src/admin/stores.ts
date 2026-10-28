import { type Db, schema } from "@closet/db";
import type {
  AdminStores,
  BestBuyKeyInput,
  EbayKeysInput,
  SettingOrigin,
  ShopifyStoreInput,
  SourceInfo,
} from "@closet/shared";
import { bestBuyKeyInputSchema, ebayKeysInputSchema, shopifyStoreInputSchema } from "@closet/shared";
import { eq } from "drizzle-orm";
import type { Config } from "../config.js";
import { type SafeFetchOptions, safeFetch } from "@closet/readers";
import type { SearchService } from "../search/service.js";
import { type Source, type StoreSetup, buildSources, setupFromConfig } from "../search/sources/index.js";
import type { ShopifyStore } from "../search/sources/shopify.js";
import { decryptSecret, encryptSecret, hintOf } from "./secrets.js";

const KEY = "stores";

/** What's saved in server_setting under "stores". Keys are encrypted (see secrets.ts). */
type Saved = {
  shopify: ShopifyStore[];
  ebay: { clientId: string; clientSecret: string; marketplace: string } | null;
  bestbuy: { apiKey: string } | null;
};

const empty = (): Saved => ({ shopify: [], ebay: null, bestbuy: null });

export class StoreSetupError extends Error {}

/**
 * The stores search uses: the environment's (SHOPIFY_STORES, EBAY_*, BESTBUY_API_KEY) plus what the
 * owner adds on the admin page. Environment settings win and can't be changed here; the page adds
 * Shopify stores alongside them and fills in keys the environment leaves out. Every change rebuilds
 * the sources search uses, so it takes effect without a restart.
 */
export class StoreSettings {
  private saved: Saved = empty();
  private current: { sources: Source[]; info: SourceInfo[] };
  private readonly env: StoreSetup;

  constructor(
    private readonly db: Db,
    private readonly config: Config,
    private readonly search: SearchService,
    private readonly fetchOptions: SafeFetchOptions,
    /** Fixed sources (tests): the admin page can't change them. */
    private readonly fixed?: { sources: Source[]; info: SourceInfo[] },
  ) {
    this.env = setupFromConfig(config);
    this.current = fixed ?? buildSources(this.env);
  }

  info(): SourceInfo[] {
    return this.current.info;
  }

  currentSources(): Source[] {
    return this.current.sources;
  }

  /** Read what the admin page saved and start searching with it. Call once on start. */
  async load() {
    const [row] = await this.db.select().from(schema.serverSetting).where(eq(schema.serverSetting.key, KEY));
    this.saved = row ? { ...empty(), ...(row.value as Partial<Saved>) } : empty();
    this.apply();
  }

  /** The setup search uses: environment first, then the admin page's additions. */
  private merged(): StoreSetup {
    const secret = this.config.AUTH_SECRET;
    const envDomains = new Set(this.env.shops.map((s) => s.domain));
    const ebayKeys = this.saved.ebay && {
      clientId: this.saved.ebay.clientId,
      clientSecret: decryptSecret(this.saved.ebay.clientSecret, secret),
      marketplace: this.saved.ebay.marketplace,
    };
    const bestbuyKey = this.saved.bestbuy && decryptSecret(this.saved.bestbuy.apiKey, secret);
    return {
      protocol: this.env.protocol,
      shops: [...this.env.shops, ...this.saved.shopify.filter((s) => !envDomains.has(s.domain))],
      ebay: this.env.ebay ?? (ebayKeys?.clientSecret ? { ...ebayKeys, clientSecret: ebayKeys.clientSecret } : null),
      bestbuy: this.env.bestbuy ?? (bestbuyKey ? { apiKey: bestbuyKey } : null),
    };
  }

  private apply() {
    if (this.fixed) return;
    this.current = buildSources(this.merged());
    this.search.setSources(this.current.sources);
  }

  private async save(next: Saved, userId: string) {
    await this.db
      .insert(schema.serverSetting)
      .values({ key: KEY, value: next, updatedBy: userId })
      .onConflictDoUpdate({ target: schema.serverSetting.key, set: { value: next, updatedAt: new Date(), updatedBy: userId } });
    this.saved = next;
    this.apply();
  }

  /** The admin page's view: every store and key, where each comes from, and no secrets. */
  view(): AdminStores {
    const secret = this.config.AUTH_SECRET;
    const envDomains = new Set(this.env.shops.map((s) => s.domain));
    const origin = (fromEnv: boolean, saved: unknown): SettingOrigin | null => (fromEnv ? "env" : saved ? "admin" : null);
    const ebaySecret = this.saved.ebay ? decryptSecret(this.saved.ebay.clientSecret, secret) : null;
    const bestbuyKey = this.saved.bestbuy ? decryptSecret(this.saved.bestbuy.apiKey, secret) : null;
    return {
      shopify: [
        ...this.env.shops.map((s) => ({ ...s, origin: "env" as const })),
        ...this.saved.shopify.filter((s) => !envDomains.has(s.domain)).map((s) => ({ ...s, origin: "admin" as const })),
      ],
      ebay: {
        configured: Boolean(this.env.ebay ?? ebaySecret),
        origin: origin(Boolean(this.env.ebay), ebaySecret),
        hint: this.env.ebay ? hintOf(this.env.ebay.clientId) : this.saved.ebay ? hintOf(this.saved.ebay.clientId) : null,
        marketplace: this.env.ebay?.marketplace ?? this.saved.ebay?.marketplace ?? this.config.EBAY_MARKETPLACE,
      },
      bestbuy: {
        configured: Boolean(this.env.bestbuy ?? bestbuyKey),
        origin: origin(Boolean(this.env.bestbuy), bestbuyKey),
        hint: this.env.bestbuy ? hintOf(this.env.bestbuy.apiKey) : bestbuyKey ? hintOf(bestbuyKey) : null,
      },
    };
  }

  /** Add a Shopify store after checking it really is one we can read. */
  async addShopify(input: ShopifyStoreInput, userId: string) {
    const parsed = shopifyStoreInputSchema.parse(input);
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?$/.test(parsed.domain)) throw new StoreSetupError("That doesn't look like a store's address.");
    if (this.env.shops.some((s) => s.domain === parsed.domain) || this.saved.shopify.some((s) => s.domain === parsed.domain)) {
      throw new StoreSetupError("That store is already on the list.");
    }
    const found = await this.probeShopify(parsed.domain);
    const store: ShopifyStore = {
      domain: parsed.domain,
      name: parsed.name || found.name,
      condition: parsed.condition,
      currency: parsed.currency,
    };
    await this.save({ ...this.saved, shopify: [...this.saved.shopify, store] }, userId);
    return store;
  }

  async removeShopify(domain: string, userId: string) {
    if (this.env.shops.some((s) => s.domain === domain)) throw new StoreSetupError("That store is set in the server's environment.");
    await this.save({ ...this.saved, shopify: this.saved.shopify.filter((s) => s.domain !== domain) }, userId);
  }

  async setEbay(input: EbayKeysInput, userId: string) {
    if (this.env.ebay) throw new StoreSetupError("eBay keys are set in the server's environment.");
    const { clientId, clientSecret, marketplace } = ebayKeysInputSchema.parse(input);
    await this.save({ ...this.saved, ebay: { clientId, clientSecret: encryptSecret(clientSecret, this.config.AUTH_SECRET), marketplace } }, userId);
  }

  async clearEbay(userId: string) {
    await this.save({ ...this.saved, ebay: null }, userId);
  }

  async setBestBuy(input: BestBuyKeyInput, userId: string) {
    if (this.env.bestbuy) throw new StoreSetupError("The Best Buy key is set in the server's environment.");
    const { apiKey } = bestBuyKeyInputSchema.parse(input);
    await this.save({ ...this.saved, bestbuy: { apiKey: encryptSecret(apiKey, this.config.AUTH_SECRET) } }, userId);
  }

  async clearBestBuy(userId: string) {
    await this.save({ ...this.saved, bestbuy: null }, userId);
  }

  /** A Shopify store answers /products.json; /meta.json has its name. */
  private async probeShopify(domain: string) {
    const base = `${this.env.protocol}://${domain}`;
    try {
      const products = await safeFetch(`${base}/products.json?limit=1`, { ...this.fetchOptions, maxBytes: 512 * 1024, timeoutMs: 8000 });
      const body = JSON.parse(products.body.toString("utf8")) as { products?: unknown };
      if (!Array.isArray(body.products)) throw new Error("no products");
    } catch {
      throw new StoreSetupError("We couldn't read that store's products. Check the address, or the store may not run on Shopify.");
    }
    let name = domain.replace(/^www\./, "").split(".")[0] ?? domain;
    name = name.charAt(0).toUpperCase() + name.slice(1);
    try {
      const meta = await safeFetch(`${base}/meta.json`, { ...this.fetchOptions, maxBytes: 64 * 1024, timeoutMs: 5000 });
      const parsed = JSON.parse(meta.body.toString("utf8")) as { name?: unknown };
      if (typeof parsed.name === "string" && parsed.name.trim()) name = parsed.name.trim().slice(0, 80);
    } catch {
      // The name is a nicety; the guess from the domain will do.
    }
    return { name };
  }
}
