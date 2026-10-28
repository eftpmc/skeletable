import { type Db, schema } from "@skeleton/db";
import type {
  Condition,
  ConditionSummary,
  OfferSummary,
  ProductDetail,
  ResultCard,
  SearchResponse,
  SourceStatus,
  SearchIntent,
} from "@skeleton/shared";
import { conditions, searchIntentSchema } from "@skeleton/shared";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { upsertBrand } from "../closet/service.js";
import { fetchLinkPreview } from "../closet/link-preview.js";
import type { SafeFetchOptions } from "@skeleton/engine";
import { isAccessoryFor, matchKey, modelCode, modelWord, relevance } from "./normalize.js";
import type { RawOffer, Source, SourceQuery } from "./sources/index.js";
import { verdictFor } from "./verdict.js";
import { matchingProduct } from "./matching.js";
import { SearchInterpreter } from "./interpreter.js";
import { preferenceScore, retrievalQueries, satisfiesIntent } from "./intent-ranking.js";

const { brand, offer, pricePoint, product, store } = schema;

export class NotFoundError extends Error {}

export type SearchOptions = {
  intent?: SearchIntent;
  mode?: "auto" | "assisted" | "keyword";
  condition?: Condition;
  maxPriceCents?: number;
  /** Skip the cache and ask every source again (scheduled re-runs). */
  fresh?: boolean;
};

type StoredOffer = RawOffer & { id: string; productId: string };

const SOURCE_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 10 * 60 * 1000;
export const MIN_RELEVANCE = 0.6;

export class SearchService {
  private cache = new Map<string, { at: number; value: SearchResponse }>();

  constructor(
    private readonly db: Db,
    private sources: Source[],
    private readonly fetchOptions: SafeFetchOptions,
    private readonly interpreter = new SearchInterpreter(),
  ) {}

  async interpret(text: string, options: SearchOptions = {}): Promise<SearchIntent> {
    const intent = options.intent ? searchIntentSchema.parse(options.intent) : await this.interpreter.interpret(text, options.mode);
    if (options.condition) intent.condition = { values: [options.condition], strength: "required", evidence: "Selected condition" };
    if (options.maxPriceCents !== undefined) intent.budget = { amountCents: options.maxPriceCents, currency: "USD", comparison: "lte", strength: "required", evidence: "Selected budget" };
    return intent;
  }

  /** One search across every enabled source. Results are stored so prices build up history. */
  async search(text: string, options: SearchOptions = {}): Promise<SearchResponse> {
    const intent = await this.interpret(text, options);
    const key = JSON.stringify([text, intent]);
    const cached = this.cache.get(key);
    if (!options.fresh && cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

    // Ask sources for every condition and price, then filter after grouping: relevance is judged
    // per product, so a terse used listing ("XM5, good condition") still shows up when it's the
    // same product as a new listing that matches the query well.
    const batches = await Promise.all(retrievalQueries(intent).map((query) => this.fanOut({ text: query, limit: 30 })));
    const raw = batches.flatMap((batch) => batch.offers);
    const statuses = batches[0]!.statuses.map((status, index) => {
      const entries = batches.map((batch) => batch.statuses[index]!);
      return { ...status, count: entries.reduce((sum, entry) => sum + entry.count, 0), ms: Math.max(...entries.map((entry) => entry.ms)), status: entries.every((entry) => entry.status === "ok") ? "ok" as const : entries.find((entry) => entry.status !== "ok")!.status };
    });
    const stored = await this.store(raw.filter((o) => !isAccessoryFor(intent.text, o.title)));
    const { cards: results, offers: kept } = await this.cards(stored, intent.text, (o) => satisfiesIntent(o, intent), intent);

    const value: SearchResponse = {
      query: text,
      intent,
      total: kept.length,
      storeCount: new Set(kept.map((o) => o.store.domain)).size,
      sources: statuses,
      results,
    };
    this.cache.set(key, { at: Date.now(), value });
    if (this.cache.size > 200) this.cache.delete(this.cache.keys().next().value!);
    return value;
  }

  /** Paste a product link: read the page, store it as an offer, then look for the same product elsewhere. */
  async resolveLink(url: string): Promise<string> {
    const preview = await fetchLinkPreview(url, this.fetchOptions);
    if (!preview.title || preview.priceCents === null) throw new NotFoundError("No product found on that page");
    const host = new URL(preview.url).hostname.replace(/^www\./, "");
    const [stored] = await this.store([
      {
        source: "link",
        store: { name: preview.siteName ?? host, domain: host },
        url: preview.url,
        title: preview.title,
        brand: preview.brand,
        priceCents: preview.priceCents,
        currency: preview.currency ?? "USD",
        condition: "new",
        imageUrl: preview.images[0] ?? null,
        gtin: preview.gtin,
        mpn: preview.mpn,
        inStock: true,
      },
    ]);
    // Searching stores matching offers from other stores against the same product. Brand + model code
    // ("Sony WH-1000XM5") finds more listings than the store's full marketing title.
    const query = [preview.brand, modelWord(preview.title) ?? preview.title].filter(Boolean).join(" ");
    await this.search(query, { mode: "keyword" }).catch(() => undefined);
    return stored!.productId;
  }

  async product(id: string): Promise<ProductDetail> {
    const [row] = await this.db
      .select({ product, brandName: brand.name })
      .from(product)
      .leftJoin(brand, eq(product.brandId, brand.id))
      .where(eq(product.id, id));
    if (!row) throw new NotFoundError();

    const rows = await this.db
      .select({ offer, storeName: store.name, storeDomain: store.domain })
      .from(offer)
      .innerJoin(store, eq(offer.storeId, store.id))
      .where(and(eq(offer.productId, id), eq(offer.inStock, true)))
      .orderBy(offer.priceCents);
    const offers = rows.map((r) => toSummary(r.offer, { name: r.storeName, domain: r.storeDomain }));
    const history = await this.dailyLows([id]);

    const summaries: ConditionSummary[] = conditions.map((condition) => {
      const list = offers.filter((o) => o.condition === condition);
      const best = list[0] ?? null;
      return {
        condition,
        best,
        count: list.length,
        verdict: best && best.currency === "USD"
          ? verdictFor(best.priceCents, history.get(`${id}:${condition}`) ?? [], list.slice(1).map((o) => o.priceCents))
          : { label: "unknown", text: best ? "Price comparison unavailable for this currency" : "None right now" },
      };
    });

    return {
      id: row.product.id,
      title: row.product.title,
      brand: row.brandName,
      imageUrl: row.product.imageUrl,
      gtin: row.product.gtin,
      mpn: row.product.mpn,
      conditions: summaries,
      offers,
    };
  }

  private async fanOut(query: SourceQuery) {
    const settled = await Promise.all(
      this.sources.map(async (source) => {
        const started = Date.now();
        try {
          const offers = await withTimeout(source.search(query, { fetchOptions: this.fetchOptions }), SOURCE_TIMEOUT_MS);
          const status: SourceStatus = { id: source.id, label: source.label, status: "ok", count: offers.length, ms: Date.now() - started };
          return { offers, status };
        } catch (error) {
          const status: SourceStatus = {
            id: source.id,
            label: source.label,
            status: error instanceof TimeoutError ? "timeout" : "error",
            count: 0,
            ms: Date.now() - started,
          };
          return { offers: [] as RawOffer[], status };
        }
      }),
    );
    return { offers: settled.flatMap((s) => s.offers), statuses: settled.map((s) => s.status) };
  }

  /** Save stores, products, offers and price points. Returns offers with their ids and product ids. */
  private async store(raw: RawOffer[]): Promise<StoredOffer[]> {
    // Process the cleanest listings first (barcode, then new condition) so a new product
    // takes its name and photo from them rather than from a terse used listing.
    const rank = (o: RawOffer) => (o.gtin ? 0 : 2) + (o.condition === "new" ? 0 : 1);
    const unique = [...new Map(raw.map((o) => [o.url, o])).values()].sort((a, b) => rank(a) - rank(b));
    if (unique.length === 0) return [];

    const domains = [...new Map(unique.map((o) => [o.store.domain, o.store.name])).entries()];
    await this.db
      .insert(store)
      .values(domains.map(([domain, name]) => ({ domain, name })))
      .onConflictDoNothing({ target: store.domain });
    const storeRows = await this.db.select().from(store).where(inArray(store.domain, domains.map(([d]) => d)));
    const storeIds = new Map(storeRows.map((s) => [s.domain, s.id]));

    const existing = await this.db
      .select({ id: offer.id, url: offer.url, priceCents: offer.priceCents, productId: offer.productId })
      .from(offer)
      .where(inArray(offer.url, unique.map((o) => o.url)));
    const byUrl = new Map(existing.map((e) => [e.url, e]));

    const stored: StoredOffer[] = [];
    for (const o of unique) {
      const productId = byUrl.get(o.url)?.productId ?? (await this.productFor(o));
      const values = {
        productId,
        storeId: storeIds.get(o.store.domain)!,
        source: o.source,
        url: o.url,
        title: o.title,
        brand: o.brand,
        priceCents: o.priceCents,
        currency: o.currency,
        condition: o.condition,
        imageUrl: o.imageUrl,
        inStock: o.inStock,
        lastSeenAt: new Date(),
      };
      const [row] = await this.db
        .insert(offer)
        .values(values)
        .onConflictDoUpdate({ target: offer.url, set: { ...values, productId: sql`coalesce(${offer.productId}, excluded.product_id)` } })
        .returning({ id: offer.id, productId: offer.productId });
      const before = byUrl.get(o.url);
      if (!before || before.priceCents !== o.priceCents) {
        await this.db.insert(pricePoint).values({ offerId: row!.id, priceCents: o.priceCents });
      }
      stored.push({ ...o, id: row!.id, productId: row!.productId! });
    }
    return stored;
  }

  /** Find the product this offer belongs to (GTIN, MPN, model code, then brand + title), or create it. */
  private async productFor(o: RawOffer): Promise<string> {
    const key = matchKey(o.brand, o.title);
    const model = modelCode(o.title);
    const candidates = await this.db
      .select({ id: product.id, gtin: product.gtin, mpn: product.mpn, model: product.model, matchKey: product.matchKey, brand: brand.name })
      .from(product)
      .leftJoin(brand, eq(product.brandId, brand.id))
      .where(
        sql`${o.gtin ? sql`${product.gtin} = ${o.gtin} or ` : sql``}${o.mpn ? sql`lower(${product.mpn}) = ${o.mpn.toLowerCase()} or ` : sql``}${model ? sql`${product.model} = ${model} or ` : sql``}${product.matchKey} = ${key}`,
      )
      .limit(10);
    const match = matchingProduct({ ...o, model, matchKey: key }, candidates);

    if (match) {
      if ((o.gtin && !match.gtin) || (o.mpn && !match.mpn)) {
        await this.db
          .update(product)
          .set({ gtin: match.gtin ?? o.gtin, mpn: match.mpn ?? o.mpn })
          .where(eq(product.id, match.id));
      }
      return match.id;
    }

    const brandId = o.brand ? await upsertBrand(this.db, o.brand) : null;
    const [created] = await this.db
      .insert(product)
      .values({ brandId, title: o.title, matchKey: key, gtin: o.gtin, mpn: o.mpn, model, imageUrl: o.imageUrl })
      .returning({ id: product.id });
    return created!.id;
  }

  private async cards(
    offers: StoredOffer[],
    text: string,
    keep: (o: StoredOffer) => boolean,
    intent: SearchIntent,
  ): Promise<{ cards: ResultCard[]; offers: StoredOffer[] }> {
    const groups = new Map<string, StoredOffer[]>();
    for (const o of offers) groups.set(o.productId, [...(groups.get(o.productId) ?? []), o]);
    const history = await this.dailyLows([...groups.keys()]);
    const products = groups.size
      ? await this.db
          .select({ id: product.id, title: product.title, imageUrl: product.imageUrl, brand: brand.name })
          .from(product)
          .leftJoin(brand, eq(product.brandId, brand.id))
          .where(inArray(product.id, [...groups.keys()]))
      : [];
    const productInfo = new Map(products.map((p) => [p.id, p]));

    const scored = [...groups.entries()].map(([productId, all]) => ({
      productId,
      score: Math.max(...all.map((o) => relevance(text, o.title, o.brand))),
      list: all.filter(keep),
    }));

    const cards = scored.filter((group) => group.list.length > 0).map(({ productId, score, list }) => {
      const sorted = [...list].sort((a, b) => preferenceScore(b, intent) - preferenceScore(a, intent) || a.priceCents - b.priceCents);
      const best = sorted[0]!;
      const sameCondition = sorted.filter((o) => o.condition === best.condition && o.currency === best.currency);
      return {
        list,
        score,
        preference: preferenceScore(best, intent),
        card: {
          productId,
          title: productInfo.get(productId)?.title ?? best.title,
          brand: productInfo.get(productId)?.brand ?? best.brand,
          imageUrl: productInfo.get(productId)?.imageUrl ?? sorted.find((o) => o.imageUrl)?.imageUrl ?? null,
          best: toSummary({ ...best, id: best.id }, best.store),
          offerCount: list.length,
          storeCount: new Set(list.map((o) => o.store.domain)).size,
          verdict: best.currency !== "USD" || sameCondition.some((o) => o.priceCents < best.priceCents)
            ? { label: "unknown", text: "Selected for your preferences; compare all offers" }
            : verdictFor(
            best.priceCents,
            history.get(`${productId}:${best.condition}`) ?? [],
            sameCondition.slice(1).map((o) => o.priceCents),
          ),
        } satisfies ResultCard,
      };
    });

    const relevant = cards
      .filter((entry) => entry.score >= MIN_RELEVANCE)
      .sort((a, b) => Math.round(b.score * 10) - Math.round(a.score * 10) || b.preference - a.preference || a.card.best.priceCents - b.card.best.priceCents);
    return { cards: relevant.map((entry) => entry.card), offers: relevant.flatMap((entry) => entry.list) };
  }

  /** Lowest price per day over the last 60 days, keyed by "productId:condition". */
  private async dailyLows(productIds: string[]): Promise<Map<string, number[]>> {
    if (productIds.length === 0) return new Map();
    const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const rows = await this.db
      .select({
        productId: offer.productId,
        condition: offer.condition,
        day: sql<string>`date_trunc('day', ${pricePoint.seenAt})::date::text`,
        low: sql<number>`min(${pricePoint.priceCents})::int`,
      })
      .from(pricePoint)
      .innerJoin(offer, eq(pricePoint.offerId, offer.id))
      .where(and(inArray(offer.productId, productIds), eq(offer.currency, "USD"), gte(pricePoint.seenAt, since)))
      .groupBy(sql`1, 2, 3`)
      .orderBy(sql`3`);
    const map = new Map<string, number[]>();
    for (const r of rows) {
      const key = `${r.productId}:${r.condition}`;
      map.set(key, [...(map.get(key) ?? []), r.low]);
    }
    return map;
  }

  /** Forget cached results (tests, and after sources change). */
  clearCache() {
    this.cache.clear();
  }

  /** Search a different set of stores from now on (the admin changed them). */
  setSources(sources: Source[]) {
    this.sources = sources;
    this.clearCache();
  }
}

function toSummary(
  o: { id: string; title: string; brand: string | null; priceCents: number; currency: string; condition: string; url: string; imageUrl: string | null; source: string },
  storeInfo: { name: string; domain: string },
): OfferSummary {
  return {
    id: o.id,
    title: o.title,
    brand: o.brand,
    priceCents: o.priceCents,
    currency: o.currency,
    condition: o.condition as Condition,
    store: storeInfo,
    url: o.url,
    imageUrl: o.imageUrl,
    source: o.source,
  };
}

class TimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new TimeoutError()), ms);
    }),
  ]);
}

