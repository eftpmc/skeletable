import { type Db, schema } from "@skeleton/db";
import {
  type BrandCard,
  type BrandDetail,
  type BrandMatch,
  type CatalogItem,
  type CategoryCount,
  type CategoryGroupId,
  type CategoryId,
  type Department,
  type ForYou,
  type ItemDetail,
  type ItemFeed,
  type Preferences,
  TASTE_UNLOCK,
  type BrandVerdict,
  catalogCategories,
  categoriesIn,
  departmentsFor,
} from "@skeleton/shared";
import { type AnyColumn, and, asc, cosineDistance, desc, eq, gte, ilike, inArray, lt, ne, notInArray, sql } from "drizzle-orm";
import { readPreferences } from "../preferences/service.js";
import { type CatalogIndex, toIndexed } from "./search-index.js";

const { brand, brandProfile, brandView, brandVote, catalogItem, itemView, offer, watch } = schema;

export class NotFoundError extends Error {}

/** Brands below this quality are never offered as finds. Matches the lab's bar (lab/brands/rank.py). */
export const QUALITY_BAR = 0.4;
// Starting suggestions come from the clearly good brands.
const STARTER_BAR = 0.6;
const NEIGHBORS = 10;
const CANDIDATES = 60;
// Of every ten "For you" picks, how many go to brands nobody has voted on yet.
const EXPLORE = 2;
// A look at a brand counts toward taste once it's this long, or the second time you open it.
const ENGAGED_MS = 8000;
// One visit adds at most this much time, so a tab left open doesn't outweigh everything else.
const VISIT_CAP_MS = 5 * 60 * 1000;

/**
 * How much having looked at a brand says about taste, next to a heart's 1: nothing for a quick
 * bounce, about half for a real look, a little more for coming back or staying longer.
 */
export function viewWeight(views: number, dwellMs: number) {
  if (views < 2 && dwellMs < ENGAGED_MS) return 0;
  return Math.min(0.8, 0.4 + 0.1 * Math.max(0, views - 1) + (0.3 * Math.min(dwellMs, 60_000)) / 60_000);
}

type Profile = typeof brandProfile.$inferSelect;
type Vector = number[];

type ItemRow = typeof catalogItem.$inferSelect;

/** A product as a card shows it. */
type CardRow = Pick<ItemRow, "id" | "brandId" | "imageUrl" | "imageWidth" | "imageHeight" | "title" | "priceUsd" | "productUrl"> & {
  brandName: string;
  category: CategoryId;
  department: Department;
};

const FEED_PAGE = 30;
// How many products the feed ranks per request: the closest to someone's taste (or the best, before
// there is one). Fifty pages of thirty.
const FEED_POOL = 1500;
// How much looking (in view weights; a real look is about half) before the feed leans to a side.
const LEAN_AFTER = 1.5;
const MORE_FROM_BRAND = 8;
const MORE_LIKE_THIS = 8;

/** A stable 0..1 number per (seed, key), in SQL: the same shuffle for a whole browsing session. */
const hash = (seed: string, key: AnyColumn) =>
  sql<number>`(('x' || substr(md5(${seed} || ${key}::text), 1, 8))::bit(32)::bigint / 4294967296.0)`;

/** What a product card needs, read with the brand's name. */
const cardColumns = {
  id: catalogItem.id,
  brandId: catalogItem.brandId,
  brandName: brand.name,
  imageUrl: catalogItem.imageUrl,
  imageWidth: catalogItem.imageWidth,
  imageHeight: catalogItem.imageHeight,
  title: catalogItem.title,
  priceUsd: catalogItem.priceUsd,
  productUrl: catalogItem.productUrl,
  category: catalogItem.category,
  department: catalogItem.department,
};

/**
 * Until someone picks a side in Settings, a nudge toward the side they've opened and saved: up to
 * 0.3 up for theirs and 0.3 down for the other once they've looked at a few products. Unisex is neutral.
 */
export function leanBonus(lean: { women: number; men: number } | null, department: Department) {
  if (!lean || department === "unisex") return 0;
  const total = lean.women + lean.men;
  if (total < LEAN_AFTER) return 0;
  return 0.6 * (lean[department] / total - 0.5);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const norm = (v: Vector) => Math.hypot(...v) || 1;
const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
};

/** How far over someone's price cap a product is, as a ranking penalty: up to 0.5 at three times the cap. */
export function pricePenalty(price: number | null, cap: number | null) {
  if (!price || !cap || price <= cap) return 0;
  return 0.5 * Math.min(1, Math.log(price / cap) / Math.log(3));
}

/** Brands someone shopping one side shouldn't be shown: the ones that only make the other side. */
const otherSide = (prefs: Preferences) => (prefs.shopFor === "women" ? "men" : prefs.shopFor === "men" ? "women" : null);
const mid = (p: Pick<Profile, "priceLowUsd" | "priceHighUsd">) =>
  p.priceLowUsd && p.priceHighUsd ? (p.priceLowUsd + p.priceHighUsd) / 2 : null;
const priceGap = (a: number | null, b: number | null) => (a && b ? Math.abs(Math.log(a / b)) : 0);

/** Shopify's image CDN resizes on request; other stores' images are used as they are. */
export function sized(url: string, px: number) {
  if (!/cdn\.shopify\.com|\/cdn\/shop\//.test(url)) return url;
  const u = new URL(url);
  u.searchParams.set("width", String(px));
  return u.toString();
}

export class CatalogService {
  constructor(
    private db: Db,
    private index: CatalogIndex,
  ) {}

  /** Brands whose name contains the query: stores first, then by quality. */
  async search(userId: string, q: string, limit = 12): Promise<BrandCard[]> {
    const rows = await this.db
      .select({ brand, profile: brandProfile })
      .from(brandProfile)
      .innerJoin(brand, eq(brand.id, brandProfile.brandId))
      .where(ilike(brand.name, `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`))
      .orderBy(sql`lower(${brand.name}) = lower(${q}) desc`, desc(brandProfile.kind), desc(brandProfile.quality))
      .limit(limit);
    return this.cards(userId, rows);
  }

  async detail(userId: string, brandId: string): Promise<BrandDetail> {
    const [row] = await this.db
      .select({ brand, profile: brandProfile })
      .from(brandProfile)
      .innerJoin(brand, eq(brand.id, brandProfile.brandId))
      .where(eq(brandProfile.brandId, brandId));
    if (!row) throw new NotFoundError();
    const [card] = await this.cards(userId, [row]);
    const photos = await this.db
      .select()
      .from(catalogItem)
      .where(eq(catalogItem.brandId, brandId))
      .orderBy(asc(catalogItem.position))
      .limit(8);
    const [taste, prefs] = await Promise.all([this.taste(userId), readPreferences(this.db, userId)]);
    const neighbors = await this.neighbors(userId, row.profile, taste.vector, prefs);
    return {
      ...card!,
      description: row.profile.description,
      photoDetails: photos.map((p) => ({ imageUrl: sized(p.imageUrl, 800), title: p.title, priceUsd: p.priceUsd, productUrl: p.productUrl })),
      neighbors,
      personal: taste.vector !== null,
    };
  }

  /**
   * The closest store brands by look, nudged by price and quality, and by the viewer's taste once
   * they have one. "name" brands skip the price term: their prices are resale prices. Brands that
   * only make the side someone doesn't shop are left out.
   */
  private async neighbors(userId: string, from: Profile, taste: Vector | null, prefs: Preferences): Promise<BrandMatch[]> {
    const distance = cosineDistance(brandProfile.look, from.look);
    const skip = otherSide(prefs);
    const rows = await this.db
      .select({ brand, profile: brandProfile, distance })
      .from(brandProfile)
      .innerJoin(brand, eq(brand.id, brandProfile.brandId))
      .where(
        and(
          eq(brandProfile.kind, "store"),
          gte(brandProfile.quality, QUALITY_BAR),
          ne(brandProfile.brandId, from.brandId),
          skip ? sql`${brandProfile.department} is distinct from ${skip}` : undefined,
        ),
      )
      .orderBy(distance)
      .limit(CANDIDATES);
    const fromMid = from.kind === "store" ? mid(from) : null;
    const scored = rows
      .map((r) => {
        let score = 1 - Number(r.distance) - 0.04 * priceGap(fromMid, mid(r.profile)) + 0.1 * r.profile.quality;
        if (taste) score += 0.15 * dot(taste, r.profile.look);
        return { r, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, NEIGHBORS);
    const cards = await this.cards(userId, scored.map((s) => s.r));
    return withMatch(cards, scored.map((s) => s.score));
  }

  /** A few good store brands to start from, different on every visit, skipping ones already voted on. */
  async starters(userId: string, limit = 12): Promise<BrandCard[]> {
    const voted = this.db.select({ id: brandVote.brandId }).from(brandVote).where(eq(brandVote.userId, userId));
    const rows = await this.db
      .select({ brand, profile: brandProfile })
      .from(brandProfile)
      .innerJoin(brand, eq(brand.id, brandProfile.brandId))
      .where(and(eq(brandProfile.kind, "store"), gte(brandProfile.quality, STARTER_BAR), notInArray(brandProfile.brandId, voted)))
      .orderBy(sql`random()`)
      .limit(limit);
    return this.cards(userId, rows);
  }

  /** Cast, change or clear a vote. Only brands in the catalog can be voted on. */
  async vote(userId: string, brandId: string, verdict: BrandVerdict | null, context?: string) {
    const [exists] = await this.db.select({ id: brandProfile.brandId }).from(brandProfile).where(eq(brandProfile.brandId, brandId));
    if (!exists) throw new NotFoundError();
    if (!verdict) {
      await this.db.delete(brandVote).where(and(eq(brandVote.userId, userId), eq(brandVote.brandId, brandId)));
      return;
    }
    await this.db
      .insert(brandVote)
      .values({ userId, brandId, verdict, context })
      .onConflictDoUpdate({ target: [brandVote.userId, brandVote.brandId], set: { verdict, context, createdAt: sql`now()` } });
  }

  /**
   * Taste: the weighted mean look of brands and products someone showed interest in (a heart or a
   * save counts 1, a real look at a brand's page or a product counts less; see viewWeight), minus
   * half the mean of brands they marked not for them or not a brand, normalized. Null until they're
   * interested in TASTE_UNLOCK brands and products.
   */
  async taste(
    userId: string,
    unlock = TASTE_UNLOCK,
  ): Promise<{ interested: number; vector: Vector | null; liked: { id: string; name: string; look: Vector }[]; lean: { women: number; men: number } }> {
    const [votes, views, itemViews] = await Promise.all([
      this.db
        .select({ id: brand.id, name: brand.name, verdict: brandVote.verdict, look: brandProfile.look })
        .from(brandVote)
        .innerJoin(brandProfile, eq(brandProfile.brandId, brandVote.brandId))
        .innerJoin(brand, eq(brand.id, brandVote.brandId))
        .where(eq(brandVote.userId, userId)),
      this.db
        .select({ id: brand.id, name: brand.name, views: brandView.views, dwellMs: brandView.dwellMs, look: brandProfile.look })
        .from(brandView)
        .innerJoin(brandProfile, eq(brandProfile.brandId, brandView.brandId))
        .innerJoin(brand, eq(brand.id, brandView.brandId))
        .where(eq(brandView.userId, userId)),
      this.db
        .select({
          brandId: catalogItem.brandId,
          department: catalogItem.department,
          views: itemView.views,
          dwellMs: itemView.dwellMs,
          saved: itemView.saved,
          look: catalogItem.look,
        })
        .from(itemView)
        .innerJoin(catalogItem, eq(catalogItem.id, itemView.itemId))
        .where(eq(itemView.userId, userId)),
    ]);
    const against = votes.filter((v) => v.verdict !== "like");
    const ruledOut = new Set(against.map((v) => v.id));
    const interest = new Map<string, { id: string; name: string; look: Vector; weight: number }>();
    for (const v of views) {
      const weight = viewWeight(v.views, v.dwellMs);
      if (weight > 0 && !ruledOut.has(v.id)) interest.set(v.id, { id: v.id, name: v.name, look: v.look, weight });
    }
    for (const v of votes) if (v.verdict === "like") interest.set(v.id, { id: v.id, name: v.name, look: v.look, weight: 1 });
    const products = itemViews
      .filter((v) => !ruledOut.has(v.brandId))
      .map((v) => ({ look: v.look, department: v.department, weight: v.saved > 0 ? 1 : viewWeight(v.views, v.dwellMs) }))
      .filter((v) => v.weight > 0);
    // Which side of the catalog the products they opened and saved are from.
    const lean = { women: 0, men: 0 };
    for (const p of products) if (p.department === "women" || p.department === "men") lean[p.department] += p.weight;

    const liked = [...interest.values()];
    const all = [...liked, ...products];
    const interested = all.length;
    if (!interested || interested < unlock) return { interested, vector: null, liked, lean };
    const total = all.reduce((s, v) => s + v.weight, 0);
    const t = all[0]!.look.map((_, k) => {
      const plus = all.reduce((s, v) => s + v.weight * v.look[k]!, 0) / total;
      const minus = against.length ? against.reduce((s, v) => s + v.look[k]!, 0) / against.length : 0;
      return plus - 0.5 * minus;
    });
    const n = norm(t);
    return { interested, vector: t.map((x) => x / n), liked, lean };
  }

  /** Someone had a brand's page open for dwellMs: one more view, and the time (capped per visit). */
  async seen(userId: string, brandId: string, dwellMs: number) {
    const [exists] = await this.db.select({ id: brandProfile.brandId }).from(brandProfile).where(eq(brandProfile.brandId, brandId));
    if (!exists) throw new NotFoundError();
    const ms = Math.max(0, Math.min(Math.round(dwellMs), VISIT_CAP_MS));
    await this.db
      .insert(brandView)
      .values({ userId, brandId, views: 1, dwellMs: ms })
      .onConflictDoUpdate({
        target: [brandView.userId, brandView.brandId],
        set: { views: sql`${brandView.views} + 1`, dwellMs: sql`${brandView.dwellMs} + ${ms}`, lastViewedAt: sql`now()` },
      });
  }

  /** Someone had a product open for dwellMs (or saved it): like seen, for one product. */
  async seenItem(userId: string, itemId: string, dwellMs: number, saved = false) {
    const ms = Math.max(0, Math.min(Math.round(dwellMs), VISIT_CAP_MS));
    const s = saved ? 1 : 0;
    await this.db
      .insert(itemView)
      .values({ userId, itemId, views: 1, dwellMs: ms, saved: s })
      .onConflictDoUpdate({
        target: [itemView.userId, itemView.itemId],
        set: {
          views: sql`${itemView.views} + 1`,
          dwellMs: sql`${itemView.dwellMs} + ${ms}`,
          saved: sql`greatest(${itemView.saved}, ${s})`,
          lastViewedAt: sql`now()`,
        },
      });
  }

  /**
   * Store brands closest to someone's taste that they haven't voted on, nudged by quality. Two of
   * every ten slots go to brands nobody has voted on yet, so new brands keep getting seen.
   */
  async forYou(userId: string): Promise<ForYou> {
    const [taste, prefs] = await Promise.all([this.taste(userId), readPreferences(this.db, userId)]);
    const skip = otherSide(prefs);
    if (!taste.vector) return { interested: taste.interested, needed: TASTE_UNLOCK, brands: [] };
    // Brands you've already shown interest in aren't news; neither are ones you voted on.
    const known = new Set(taste.liked.map((l) => l.id));
    const voted = this.db.select({ id: brandVote.brandId }).from(brandVote).where(eq(brandVote.userId, userId));
    const distance = cosineDistance(brandProfile.look, taste.vector);
    const rows = await this.db
      .select({ brand, profile: brandProfile, distance })
      .from(brandProfile)
      .innerJoin(brand, eq(brand.id, brandProfile.brandId))
      .where(
        and(
          eq(brandProfile.kind, "store"),
          gte(brandProfile.quality, QUALITY_BAR),
          notInArray(brandProfile.brandId, voted),
          skip ? sql`${brandProfile.department} is distinct from ${skip}` : undefined,
        ),
      )
      .orderBy(distance)
      .limit(CANDIDATES * 2);
    const scored = rows
      .filter((r) => !known.has(r.brand.id))
      .map((r) => ({ r, score: 1 - Number(r.distance) + 0.1 * r.profile.quality }))
      .sort((a, b) => b.score - a.score);
    const picks = scored.slice(0, NEIGHBORS - EXPLORE);
    const ids = scored.map((s) => s.r.brand.id);
    const seen = ids.length
      ? new Set((await this.db.selectDistinct({ id: brandVote.brandId }).from(brandVote).where(inArray(brandVote.brandId, ids))).map((r) => r.id))
      : new Set<string>();
    const fresh = scored.slice(picks.length).filter((s) => !seen.has(s.r.brand.id));
    const explore = new Set<string>();
    for (let k = 0; k < EXPLORE && fresh.length; k++) {
      const [x] = fresh.splice(Math.floor(Math.random() * Math.min(fresh.length, 20)), 1);
      picks.splice(Math.min(picks.length, 2 + k * 4), 0, x!);
      explore.add(x!.r.brand.id);
    }
    const cards = withMatch(await this.cards(userId, picks.map((p) => p.r)), picks.map((p) => p.score));
    const brands = cards.map((c, i) => {
      const look = picks[i]!.r.profile.look;
      // Taste can come from products alone, with no brand to name as the reason.
      const near = taste.liked.reduce<(typeof taste.liked)[number] | null>(
        (best, l) => (!best || dot(l.look, look) > dot(best.look, look) ? l : best),
        null,
      );
      return { ...c, explore: explore.has(c.id) || undefined, because: near && { id: near.id, name: near.name } };
    });
    return { interested: taste.interested, needed: TASTE_UNLOCK, brands };
  }

  /**
   * Which products someone sees: store brands above the quality bar, on their side of the catalog,
   * without the categories they hid (unless they asked for one). A group (all clothing) still leaves
   * out the hidden categories in it.
   */
  private visible(prefs: Preferences, category?: CategoryId, group?: CategoryGroupId) {
    const conditions = [
      eq(brandProfile.kind, "store"),
      gte(brandProfile.quality, QUALITY_BAR),
      inArray(catalogItem.department, departmentsFor(prefs.shopFor)),
    ];
    if (category) conditions.push(eq(catalogItem.category, category));
    else {
      if (prefs.hiddenCategories.length) conditions.push(notInArray(catalogItem.category, prefs.hiddenCategories));
      if (group) conditions.push(inArray(catalogItem.category, categoriesIn(group)));
    }
    return and(...conditions);
  }

  /**
   * Run a nearest-look query. The photo-vector index stops early when filters (a department, a
   * category) leave few matches; letting it keep scanning (pgvector 0.8+) returns enough of them.
   */
  private nearest<T>(query: (db: Db) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`set local hnsw.iterative_scan = relaxed_order`);
      return query(tx as unknown as Db);
    });
  }

  private toItem(i: CardRow): CatalogItem {
    return {
      id: i.id,
      brandId: i.brandId,
      brandName: i.brandName,
      imageUrl: sized(i.imageUrl, 640),
      imageWidth: i.imageWidth,
      imageHeight: i.imageHeight,
      title: i.title,
      priceUsd: i.priceUsd,
      productUrl: i.productUrl,
      category: i.category,
      department: i.department,
    };
  }

  /**
   * Discover's feed: the catalog's products on someone's side of it, ranked by how close each one
   * looks to their taste (from what they've opened and saved; quality before that), lower when it's
   * over their price cap, shuffled a little per session so it isn't the same every time, leaning to
   * each brand's newest products, and never the same brand twice in a row. Personal from the first
   * product they open.
   */
  async feed(userId: string, page: number, seed: string, category?: CategoryId, group?: CategoryGroupId): Promise<ItemFeed> {
    const [taste, prefs] = await Promise.all([this.taste(userId, 1), readPreferences(this.db, userId)]);
    const t = taste.vector;
    // The session's shuffle, worked out in the database so the shortlist and the ranking agree.
    const columns = {
      ...cardColumns,
      quality: brandProfile.quality,
      position: catalogItem.position,
      brandJitter: hash(seed, catalogItem.brandId),
      itemJitter: hash(seed, catalogItem.id),
    };
    const where = this.visible(prefs, category, group);
    // A shortlist: the products closest to their taste (the photo-vector index finds them), or before
    // there's a taste, the best by quality, newness and the shuffle. The ranking below orders it.
    const pool = t
      ? await this.nearest((db) =>
          db
            .select({ ...columns, similarity: sql<number>`1 - (${cosineDistance(catalogItem.look, t)})` })
            .from(catalogItem)
            .innerJoin(brandProfile, eq(brandProfile.brandId, catalogItem.brandId))
            .innerJoin(brand, eq(brand.id, catalogItem.brandId))
            .where(where)
            .orderBy(cosineDistance(catalogItem.look, t))
            .limit(FEED_POOL),
        )
      : await this.db
          .select({ ...columns, similarity: sql<number>`0` })
          .from(catalogItem)
          .innerJoin(brandProfile, eq(brandProfile.brandId, catalogItem.brandId))
          .innerJoin(brand, eq(brand.id, catalogItem.brandId))
          .where(where)
          .orderBy(sql`0.15 * ${brandProfile.quality} + 0.3 * ${columns.brandJitter} + 0.1 * ${columns.itemJitter} - 0.03 * ${catalogItem.position} desc`)
          .limit(FEED_POOL);

    // Until they pick a side in Settings, lean toward the one they open and save.
    const lean = prefs.shopFor === null ? taste.lean : null;
    const scored = pool.map((row) => {
      const i = { ...row, category: row.category as CategoryId, department: row.department as Department };
      return {
        i,
        score:
          1.5 * Number(i.similarity) +
          0.15 * i.quality +
          0.3 * Number(i.brandJitter) +
          0.1 * Number(i.itemJitter) -
          0.03 * i.position -
          pricePenalty(i.priceUsd, prefs.priceMaxUsd) +
          leanBonus(lean, i.department),
      };
    });
    scored.sort((a, z) => z.score - a.score);

    // Spread brands out: hold a product back while its brand appeared in the last three.
    const ordered: typeof scored = [];
    const waiting: typeof scored = [];
    const recent = () => ordered.slice(-3).map((x) => x.i.brandId);
    for (const x of scored) {
      const ready = waiting.findIndex((w) => !recent().includes(w.i.brandId));
      if (ready >= 0) ordered.push(...waiting.splice(ready, 1));
      if (recent().includes(x.i.brandId)) waiting.push(x);
      else ordered.push(x);
    }
    ordered.push(...waiting);

    const start = page * FEED_PAGE;
    return { items: ordered.slice(start, start + FEED_PAGE).map((x) => this.toItem(x.i)), next: start + FEED_PAGE < ordered.length ? page + 1 : null };
  }

  /**
   * Products on someone's side of the catalog matching every word of the query (brand, title or
   * category, typos forgiven in longer words), from the search index, so it answers before the live
   * stores do.
   */
  async searchItems(userId: string, q: string, limit = 24): Promise<CatalogItem[]> {
    const prefs = await readPreferences(this.db, userId);
    const hits = await this.index.search(q, { departments: departmentsFor(prefs.shopFor), hidden: prefs.hiddenCategories, limit });
    return hits.map((i) => this.toItem(i));
  }

  /** What the search index should hold: every product of every store brand above the quality bar, as Discover sees them. */
  private async indexable() {
    const rows = await this.db
      .select({
        id: catalogItem.id,
        brandId: catalogItem.brandId,
        brandName: brand.name,
        title: catalogItem.title,
        priceUsd: catalogItem.priceUsd,
        category: catalogItem.category,
        department: catalogItem.department,
        imageUrl: catalogItem.imageUrl,
        imageWidth: catalogItem.imageWidth,
        imageHeight: catalogItem.imageHeight,
        productUrl: catalogItem.productUrl,
        quality: brandProfile.quality,
        position: catalogItem.position,
      })
      .from(catalogItem)
      .innerJoin(brandProfile, eq(brandProfile.brandId, catalogItem.brandId))
      .innerJoin(brand, eq(brand.id, catalogItem.brandId))
      .where(and(eq(brandProfile.kind, "store"), gte(brandProfile.quality, QUALITY_BAR)));
    return rows.map((r) => toIndexed({ ...r, category: r.category as CategoryId, department: r.department as Department }));
  }

  /** Rebuild the search index from the database (after an import). */
  async reindex(items?: Awaited<ReturnType<CatalogService["indexable"]>>) {
    const all = items ?? (await this.indexable());
    await this.index.replace(all);
    return all.length;
  }

  /** Rebuild the search index only when it's missing or holds a different number of products than the database. */
  async ensureIndexed() {
    const [have, items] = await Promise.all([this.index.count(), this.indexable()]);
    return have === items.length ? null : this.reindex(items);
  }

  /** The categories someone can browse, in the taxonomy's order, with how many products each has for them. */
  async categories(userId: string): Promise<CategoryCount[]> {
    const prefs = await readPreferences(this.db, userId);
    const rows = await this.db
      .select({ category: catalogItem.category, count: sql<number>`count(*)::int` })
      .from(catalogItem)
      .innerJoin(brandProfile, eq(brandProfile.brandId, catalogItem.brandId))
      .where(this.visible(prefs))
      .groupBy(catalogItem.category);
    const counts = new Map(rows.map((r) => [r.category, r.count]));
    return catalogCategories.filter((c) => counts.has(c.id)).map((c) => ({ id: c.id, count: counts.get(c.id)! }));
  }

  /**
   * One product: its brand, more from the brand, the closest-looking products from other brands on
   * the viewer's side of the catalog (one per brand), and whether they saved it.
   */
  async item(userId: string, id: string): Promise<ItemDetail> {
    const row = await this.itemRef(id);
    const [brandRow] = await this.db
      .select({ brand, profile: brandProfile })
      .from(brandProfile)
      .innerJoin(brand, eq(brand.id, brandProfile.brandId))
      .where(eq(brandProfile.brandId, row.brandId));
    if (!brandRow) throw new NotFoundError();
    const prefs = await readPreferences(this.db, userId);
    const [[card], closest, fromBrand] = await Promise.all([
      this.cards(userId, [brandRow]),
      // The closest looks from other brands on their side of the catalog, a little closer in the same category.
      this.nearest((db) =>
        db
          .select({ ...cardColumns, distance: cosineDistance(catalogItem.look, row.look) })
          .from(catalogItem)
          .innerJoin(brandProfile, eq(brandProfile.brandId, catalogItem.brandId))
          .innerJoin(brand, eq(brand.id, catalogItem.brandId))
          .where(and(this.visible(prefs), ne(catalogItem.brandId, row.brandId)))
          .orderBy(cosineDistance(catalogItem.look, row.look))
          .limit(MORE_LIKE_THIS * 25),
      ),
      this.db
        .select(cardColumns)
        .from(catalogItem)
        .innerJoin(brand, eq(brand.id, catalogItem.brandId))
        .where(and(eq(catalogItem.brandId, row.brandId), ne(catalogItem.id, row.id)))
        .orderBy(asc(catalogItem.position))
        .limit(MORE_FROM_BRAND),
    ]);
    const self = { ...row, category: row.category as CategoryId, department: row.department as Department, brandName: brandRow.brand.name };

    const near: typeof closest = [];
    const used = new Set([row.brandId]);
    const ranked = closest
      .map((i) => ({ i, s: -Number(i.distance) + (i.category === row.category ? 0.05 : 0) }))
      .sort((a, z) => z.s - a.s);
    for (const { i } of ranked) {
      if (used.has(i.brandId)) continue;
      used.add(i.brandId);
      near.push(i);
      if (near.length === MORE_LIKE_THIS) break;
    }

    return {
      item: this.toItem(self),
      brand: card!,
      moreFromBrand: fromBrand.map((i) => this.toItem({ ...i, category: i.category as CategoryId, department: i.department as Department })),
      moreLikeThis: near.map((i) => this.toItem({ ...i, category: i.category as CategoryId, department: i.department as Department })),
      savedProductId: await this.savedProduct(userId, row.productUrl),
    };
  }

  /**
   * The tracked product a catalog item became when it was saved. Saving reads the store's page, which
   * can land on another address for the same product (a shop's own domain instead of myshopify.com),
   * so match on the product's handle.
   */
  private async savedProduct(userId: string, productUrl: string): Promise<string | null> {
    const handle = /\/products\/([^/?#]+)/.exec(new URL(productUrl).pathname)?.[1];
    if (!handle) return null;
    const [found] = await this.db
      .select({ id: watch.productId })
      .from(watch)
      .innerJoin(offer, eq(offer.productId, watch.productId))
      .where(and(eq(watch.userId, userId), sql`${offer.url} like ${`%/products/${handle}%`}`))
      .limit(1);
    return found?.id ?? null;
  }

  /** The product an id points at, for opening it, saving it (its page) and counting looks. */
  async itemRef(id: string): Promise<ItemRow> {
    if (!UUID.test(id)) throw new NotFoundError();
    const [row] = await this.db.select().from(catalogItem).where(eq(catalogItem.id, id));
    if (!row) throw new NotFoundError();
    return row;
  }

  /** Cards for brand rows: first four photos, like counts and the viewer's own vote. */
  private async cards(userId: string, rows: { brand: typeof brand.$inferSelect; profile: Profile }[]): Promise<BrandCard[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.brand.id);
    const [photos, likes, mine] = await Promise.all([
      this.db
        .select({ brandId: catalogItem.brandId, imageUrl: catalogItem.imageUrl })
        .from(catalogItem)
        .where(and(inArray(catalogItem.brandId, ids), lt(catalogItem.position, 4)))
        .orderBy(asc(catalogItem.position)),
      this.db
        .select({ brandId: brandVote.brandId, n: sql<number>`count(*)::int` })
        .from(brandVote)
        .where(and(inArray(brandVote.brandId, ids), eq(brandVote.verdict, "like")))
        .groupBy(brandVote.brandId),
      this.db
        .select({ brandId: brandVote.brandId, verdict: brandVote.verdict })
        .from(brandVote)
        .where(and(inArray(brandVote.brandId, ids), eq(brandVote.userId, userId))),
    ]);
    const photoMap = new Map<string, string[]>();
    for (const p of photos) photoMap.set(p.brandId, [...(photoMap.get(p.brandId) ?? []), sized(p.imageUrl, 400)]);
    const likeMap = new Map(likes.map((l) => [l.brandId, l.n]));
    const mineMap = new Map(mine.map((m) => [m.brandId, m.verdict as BrandVerdict]));
    return rows.map(({ brand: b, profile: p }) => ({
      id: b.id,
      name: b.name,
      kind: p.kind as BrandCard["kind"],
      site: p.site,
      platform: p.kind === "store" ? p.platform : null,
      where: [p.city, p.country].filter(Boolean).join(", ") || null,
      priceLowUsd: p.priceLowUsd,
      priceHighUsd: p.priceHighUsd,
      seenAt: p.seenAt,
      department: (p.department as BrandCard["department"]) ?? null,
      photos: photoMap.get(b.id) ?? [],
      myVote: mineMap.get(b.id) ?? null,
      likes: likeMap.get(b.id) ?? 0,
    }));
  }
}

/** Attach a 0 to 1 match value spread over the list's score range. */
function withMatch(cards: BrandCard[], scores: number[]): BrandMatch[] {
  const hi = Math.max(...scores);
  const lo = Math.min(...scores);
  return cards.map((c, i) => ({ ...c, match: hi === lo ? 1 : 0.4 + (0.6 * (scores[i]! - lo)) / (hi - lo) }));
}
