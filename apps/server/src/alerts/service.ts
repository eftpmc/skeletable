import { type Db, schema } from "@closet/db";
import type {
  AlertEvent,
  AlertsResponse,
  Condition,
  SavedSearchInput,
  SavedSearchSummary,
  WatchInput,
  WatchSummary,
} from "@closet/shared";
import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { modelWord } from "../search/normalize.js";
import type { SearchService } from "../search/service.js";

const { alertEvent, brand, offer, product, savedSearch, savedSearchSeen, watch } = schema;

export class NotFoundError extends Error {}

/** A drop worth telling someone about: at least $10 or 5%. */
const MIN_DROP_CENTS = 1000;
const MIN_DROP_SHARE = 0.05;

type Best = { priceCents: number; currency: string; storeCount: number };
type SavedSearchRow = typeof savedSearch.$inferSelect;
type WatchRow = typeof watch.$inferSelect;

export class AlertsService {
  constructor(
    private readonly db: Db,
    private readonly search: SearchService,
  ) {}

  // Watches

  async watch(userId: string, input: WatchInput): Promise<WatchSummary> {
    const [found] = await this.db.select({ id: product.id }).from(product).where(eq(product.id, input.productId));
    if (!found) throw new NotFoundError();
    const best = (await this.bestPrices([input.productId], input.condition ?? null)).get(input.productId);
    await this.db
      .insert(watch)
      .values({
        userId,
        productId: input.productId,
        condition: input.condition ?? null,
        savedPriceCents: best?.priceCents ?? null,
        lastPriceCents: best?.priceCents ?? null,
        currency: best?.currency ?? null,
      })
      .onConflictDoNothing();
    const summary = (await this.watches(userId)).find((w) => w.productId === input.productId);
    if (!summary) throw new NotFoundError();
    return summary;
  }

  async unwatch(userId: string, productId: string) {
    await this.db.delete(watch).where(and(eq(watch.userId, userId), eq(watch.productId, productId)));
  }

  /** Newest first, each with its best price now. */
  async watches(userId: string): Promise<WatchSummary[]> {
    const rows = await this.db
      .select({ watch, title: product.title, imageUrl: product.imageUrl, brandName: brand.name })
      .from(watch)
      .innerJoin(product, eq(watch.productId, product.id))
      .leftJoin(brand, eq(product.brandId, brand.id))
      .where(eq(watch.userId, userId))
      .orderBy(desc(watch.createdAt));
    const ids = rows.map((r) => r.watch.productId);
    const any = await this.bestPrices(ids, null);
    const byCondition = new Map<string, Map<string, Best>>();
    for (const condition of new Set(rows.map((r) => r.watch.condition).filter((c): c is string => c !== null))) {
      byCondition.set(condition, await this.bestPrices(ids, condition));
    }
    return rows.map(({ watch: w, title, imageUrl, brandName }) => {
      const best = (w.condition ? byCondition.get(w.condition) : any)?.get(w.productId);
      const current = best?.priceCents ?? null;
      return {
        productId: w.productId,
        title,
        brand: brandName,
        imageUrl,
        condition: w.condition as Condition | null,
        savedPriceCents: w.savedPriceCents,
        currentPriceCents: current,
        currency: best?.currency ?? w.currency,
        dropCents: current !== null && w.savedPriceCents !== null ? Math.max(0, w.savedPriceCents - current) : 0,
        storeCount: best?.storeCount ?? 0,
        createdAt: w.createdAt.toISOString(),
      };
    });
  }

  // Saved searches

  /** Saving the same search twice returns the first. Current results count as seen, not new. */
  async saveSearch(userId: string, input: SavedSearchInput): Promise<SavedSearchSummary> {
    const existing = (await this.searchRows(userId)).find(
      (s) => s.query.toLowerCase() === input.q.toLowerCase() && s.condition === (input.condition ?? null) && s.maxPrice === (input.max ?? null),
    );
    const row =
      existing ??
      (await this.db
        .insert(savedSearch)
        .values({ userId, query: input.q, condition: input.condition ?? null, maxPrice: input.max ?? null })
        .returning())[0]!;
    if (!existing) await this.run(row).catch(() => undefined);
    const summary = (await this.savedSearches(userId)).find((s) => s.id === row.id);
    if (!summary) throw new NotFoundError();
    return summary;
  }

  async deleteSearch(userId: string, id: string) {
    await this.db.delete(savedSearch).where(and(eq(savedSearch.userId, userId), eq(savedSearch.id, id)));
  }

  /** They looked at the results: nothing is new any more, and its alerts are read. */
  async markSearchViewed(userId: string, id: string) {
    const [row] = await this.db
      .update(savedSearch)
      .set({ lastViewedAt: sql`now()` })
      .where(and(eq(savedSearch.userId, userId), eq(savedSearch.id, id)))
      .returning({ id: savedSearch.id });
    if (!row) throw new NotFoundError();
    await this.db
      .update(alertEvent)
      .set({ readAt: new Date() })
      .where(and(eq(alertEvent.userId, userId), eq(alertEvent.savedSearchId, id), isNull(alertEvent.readAt)));
  }

  async savedSearches(userId: string): Promise<SavedSearchSummary[]> {
    const rows = await this.searchRows(userId);
    return Promise.all(
      rows.map(async (s) => {
        const [counted] = await this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(savedSearchSeen)
          .where(and(eq(savedSearchSeen.savedSearchId, s.id), gt(savedSearchSeen.firstSeenAt, s.lastViewedAt)));
        return {
          id: s.id,
          query: s.query,
          condition: s.condition as Condition | null,
          max: s.maxPrice,
          newCount: counted?.count ?? 0,
          images: await this.newestImages(s.id),
          createdAt: s.createdAt.toISOString(),
          lastRunAt: s.lastRunAt?.toISOString() ?? null,
        };
      }),
    );
  }

  // Alert feed

  async alerts(userId: string): Promise<AlertsResponse> {
    const rows = await this.db
      .select({ event: alertEvent, search: savedSearch, title: product.title, imageUrl: product.imageUrl, brandName: brand.name })
      .from(alertEvent)
      .leftJoin(savedSearch, eq(alertEvent.savedSearchId, savedSearch.id))
      .leftJoin(product, eq(alertEvent.productId, product.id))
      .leftJoin(brand, eq(product.brandId, brand.id))
      .where(eq(alertEvent.userId, userId))
      .orderBy(desc(alertEvent.createdAt))
      .limit(50);

    const events: AlertEvent[] = [];
    for (const { event: e, search: s, title, imageUrl, brandName } of rows) {
      const base = { id: e.id, createdAt: e.createdAt.toISOString(), read: e.readAt !== null };
      if (e.kind === "new_matches" && s) {
        events.push({
          ...base,
          kind: "new_matches",
          count: e.count ?? 0,
          search: { id: s.id, query: s.query, condition: s.condition as Condition | null, max: s.maxPrice },
          images: await this.newestImages(s.id),
        });
      } else if (e.kind === "price_drop" && e.productId && title !== null) {
        events.push({
          ...base,
          kind: "price_drop",
          product: { id: e.productId, title, brand: brandName, imageUrl },
          fromPriceCents: e.fromPriceCents ?? 0,
          toPriceCents: e.toPriceCents ?? 0,
          currency: e.currency ?? "USD",
        });
      }
    }
    return { unread: await this.unreadCount(userId), events };
  }

  async unreadCount(userId: string) {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(alertEvent)
      .where(and(eq(alertEvent.userId, userId), isNull(alertEvent.readAt)));
    return row?.count ?? 0;
  }

  async markAllRead(userId: string) {
    await this.db.update(alertEvent).set({ readAt: new Date() }).where(and(eq(alertEvent.userId, userId), isNull(alertEvent.readAt)));
  }

  // Scheduled work

  /** Re-run every saved search and re-price every watched product. One failure doesn't stop the rest. */
  async runAll() {
    const searches = await this.db.select().from(savedSearch);
    for (const s of searches) {
      await this.run(s).catch((error) => console.error(`saved search ${s.id} failed:`, error));
    }
    const watches = await this.db.select().from(watch);
    for (const productId of new Set(watches.map((w) => w.productId))) {
      await this.refreshProduct(productId).catch((error) => console.error(`refreshing ${productId} failed:`, error));
    }
    for (const w of watches) {
      await this.checkWatch(w).catch((error) => console.error(`watch ${w.id} failed:`, error));
    }
  }

  /** Search again; products not seen before are new. The first run only records what's there. */
  private async run(s: SavedSearchRow) {
    const first = s.lastRunAt === null;
    const response = await this.search.search(s.query, {
      condition: (s.condition as Condition | null) ?? undefined,
      maxPriceCents: s.maxPrice ? s.maxPrice * 100 : undefined,
      fresh: true,
    });
    const ids = response.results.map((r) => r.productId);
    const added = ids.length
      ? await this.db
          .insert(savedSearchSeen)
          .values(ids.map((productId) => ({ savedSearchId: s.id, productId })))
          .onConflictDoNothing()
          .returning({ productId: savedSearchSeen.productId })
      : [];
    // Database time, so "seen" and "viewed" compare on one clock.
    const now = sql`now()`;
    await this.db
      .update(savedSearch)
      .set(first ? { lastRunAt: now, lastViewedAt: now } : { lastRunAt: now })
      .where(eq(savedSearch.id, s.id));
    if (!first && added.length > 0) {
      await this.db.insert(alertEvent).values({ userId: s.userId, kind: "new_matches", savedSearchId: s.id, count: added.length });
    }
  }

  /** Prices only change when we ask the stores, so search for the product by brand and model. */
  private async refreshProduct(productId: string) {
    const [row] = await this.db
      .select({ title: product.title, brandName: brand.name })
      .from(product)
      .leftJoin(brand, eq(product.brandId, brand.id))
      .where(eq(product.id, productId));
    if (!row) return;
    const query = [row.brandName, modelWord(row.title) ?? row.title].filter(Boolean).join(" ");
    await this.search.search(query, { fresh: true });
  }

  private async checkWatch(w: WatchRow) {
    const best = (await this.bestPrices([w.productId], w.condition)).get(w.productId);
    if (!best) return;
    const last = w.lastPriceCents ?? w.savedPriceCents;
    const drop = last === null ? 0 : last - best.priceCents;
    if (last !== null && drop > 0 && (drop >= MIN_DROP_CENTS || drop / last >= MIN_DROP_SHARE)) {
      await this.db.insert(alertEvent).values({
        userId: w.userId,
        kind: "price_drop",
        productId: w.productId,
        fromPriceCents: last,
        toPriceCents: best.priceCents,
        currency: best.currency,
      });
    }
    // Small dips and rises move the baseline too, so the next drop is measured from today's price.
    if (best.priceCents !== last) {
      await this.db
        .update(watch)
        .set({ lastPriceCents: best.priceCents, savedPriceCents: w.savedPriceCents ?? best.priceCents, currency: best.currency })
        .where(eq(watch.id, w.id));
    }
  }

  // Helpers

  private searchRows(userId: string) {
    return this.db.select().from(savedSearch).where(eq(savedSearch.userId, userId)).orderBy(desc(savedSearch.createdAt));
  }

  /** Photos of the products a saved search found most recently. */
  private async newestImages(savedSearchId: string) {
    const rows = await this.db
      .select({ imageUrl: product.imageUrl })
      .from(savedSearchSeen)
      .innerJoin(product, eq(savedSearchSeen.productId, product.id))
      .where(and(eq(savedSearchSeen.savedSearchId, savedSearchId), sql`${product.imageUrl} is not null`))
      .orderBy(desc(savedSearchSeen.firstSeenAt))
      .limit(4);
    return rows.map((r) => r.imageUrl!);
  }

  /** Cheapest in-stock offer per product, optionally for one condition. */
  private async bestPrices(productIds: string[], condition: string | null) {
    const best = new Map<string, Best>();
    if (productIds.length === 0) return best;
    const rows = await this.db
      .select({ productId: offer.productId, priceCents: offer.priceCents, currency: offer.currency, storeId: offer.storeId })
      .from(offer)
      .where(
        and(
          inArray(offer.productId, productIds),
          eq(offer.inStock, true),
          condition ? eq(offer.condition, condition) : undefined,
        ),
      );
    const stores = new Map<string, Set<string>>();
    for (const r of rows) {
      if (!r.productId) continue;
      stores.set(r.productId, (stores.get(r.productId) ?? new Set()).add(r.storeId));
      const current = best.get(r.productId);
      if (!current || r.priceCents < current.priceCents) best.set(r.productId, { priceCents: r.priceCents, currency: r.currency, storeCount: 0 });
    }
    for (const [id, b] of best) b.storeCount = stores.get(id)?.size ?? 0;
    return best;
  }
}
