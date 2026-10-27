import { type Db, schema } from "@closet/db";
import {
  type BrandCard,
  type BrandDetail,
  type BrandMatch,
  type ForYou,
  TASTE_UNLOCK,
  type BrandVerdict,
} from "@closet/shared";
import { and, asc, cosineDistance, desc, eq, gte, ilike, inArray, ne, notInArray, sql } from "drizzle-orm";

const { brand, brandPhoto, brandProfile, brandView, brandVote } = schema;

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

const norm = (v: Vector) => Math.hypot(...v) || 1;
const dot = (a: Vector, b: Vector) => a.reduce((s, x, i) => s + x * b[i]!, 0);
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
  constructor(private db: Db) {}

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
      .from(brandPhoto)
      .where(eq(brandPhoto.brandId, brandId))
      .orderBy(asc(brandPhoto.position));
    const taste = await this.taste(userId);
    const neighbors = await this.neighbors(userId, row.profile, taste.vector);
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
   * they have one. "name" brands skip the price term: their prices are resale prices.
   */
  private async neighbors(userId: string, from: Profile, taste: Vector | null): Promise<BrandMatch[]> {
    const distance = cosineDistance(brandProfile.look, from.look);
    const rows = await this.db
      .select({ brand, profile: brandProfile, distance })
      .from(brandProfile)
      .innerJoin(brand, eq(brand.id, brandProfile.brandId))
      .where(and(eq(brandProfile.kind, "store"), gte(brandProfile.quality, QUALITY_BAR), ne(brandProfile.brandId, from.brandId)))
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
   * Taste: the weighted mean look of brands someone showed interest in (a heart counts 1, a real
   * look at a brand's page counts less; see viewWeight), minus half the mean of what they marked not
   * for them or not a brand, normalized. Null until they're interested in TASTE_UNLOCK brands.
   */
  async taste(userId: string): Promise<{ interested: number; vector: Vector | null; liked: { id: string; name: string; look: Vector }[] }> {
    const [votes, views] = await Promise.all([
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
    ]);
    const against = votes.filter((v) => v.verdict !== "like");
    const ruledOut = new Set(against.map((v) => v.id));
    const interest = new Map<string, { id: string; name: string; look: Vector; weight: number }>();
    for (const v of views) {
      const weight = viewWeight(v.views, v.dwellMs);
      if (weight > 0 && !ruledOut.has(v.id)) interest.set(v.id, { id: v.id, name: v.name, look: v.look, weight });
    }
    for (const v of votes) if (v.verdict === "like") interest.set(v.id, { id: v.id, name: v.name, look: v.look, weight: 1 });

    const liked = [...interest.values()];
    if (liked.length < TASTE_UNLOCK) return { interested: liked.length, vector: null, liked };
    const total = liked.reduce((s, v) => s + v.weight, 0);
    const t = liked[0]!.look.map((_, k) => {
      const plus = liked.reduce((s, v) => s + v.weight * v.look[k]!, 0) / total;
      const minus = against.length ? against.reduce((s, v) => s + v.look[k]!, 0) / against.length : 0;
      return plus - 0.5 * minus;
    });
    const n = norm(t);
    return { interested: liked.length, vector: t.map((x) => x / n), liked };
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

  /**
   * Store brands closest to someone's taste that they haven't voted on, nudged by quality. Two of
   * every ten slots go to brands nobody has voted on yet, so new brands keep getting seen.
   */
  async forYou(userId: string): Promise<ForYou> {
    const taste = await this.taste(userId);
    if (!taste.vector) return { interested: taste.interested, needed: TASTE_UNLOCK, brands: [] };
    // Brands you've already shown interest in aren't news; neither are ones you voted on.
    const known = new Set(taste.liked.map((l) => l.id));
    const voted = this.db.select({ id: brandVote.brandId }).from(brandVote).where(eq(brandVote.userId, userId));
    const distance = cosineDistance(brandProfile.look, taste.vector);
    const rows = await this.db
      .select({ brand, profile: brandProfile, distance })
      .from(brandProfile)
      .innerJoin(brand, eq(brand.id, brandProfile.brandId))
      .where(and(eq(brandProfile.kind, "store"), gte(brandProfile.quality, QUALITY_BAR), notInArray(brandProfile.brandId, voted)))
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
      const near = taste.liked.reduce((best, l) => (dot(l.look, look) > best.s ? { s: dot(l.look, look), l } : best), {
        s: -Infinity,
        l: taste.liked[0]!,
      }).l;
      return { ...c, explore: explore.has(c.id) || undefined, because: { id: near.id, name: near.name } };
    });
    return { interested: taste.interested, needed: TASTE_UNLOCK, brands };
  }

  /** Cards for brand rows: first four photos, like counts and the viewer's own vote. */
  private async cards(userId: string, rows: { brand: typeof brand.$inferSelect; profile: Profile }[]): Promise<BrandCard[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.brand.id);
    const [photos, likes, mine] = await Promise.all([
      this.db
        .select({ brandId: brandPhoto.brandId, imageUrl: brandPhoto.imageUrl })
        .from(brandPhoto)
        .where(and(inArray(brandPhoto.brandId, ids), sql`${brandPhoto.position} < 4`))
        .orderBy(asc(brandPhoto.position)),
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
