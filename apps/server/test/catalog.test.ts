import { schema } from "@closet/db";
import type { BrandCard, BrandDetail, ForYou } from "@closet/shared";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { type CatalogRecord, importCatalog } from "../src/catalog/import.js";
import { signUp, useTestApp } from "./helpers/setup.js";

const { db, setup } = useTestApp();

/** A unit vector pointing mostly along one axis, so brands near the same axis look alike. */
function look(axis: number, lean = 0, toward = (axis + 1) % 512) {
  const v = new Array(512).fill(0);
  v[axis] = 1;
  v[toward] = lean;
  const n = Math.hypot(1, lean);
  return v.map((x) => x / n);
}

function store(name: string, axis: number, lean: number, extra: Partial<CatalogRecord> = {}): CatalogRecord {
  const slug = name.toLowerCase().replace(/\W+/g, "");
  return {
    kind: "store",
    name,
    site: `https://${slug}.example`,
    platform: "shopify",
    country: "GB",
    city: null,
    description: null,
    priceLowUsd: 80,
    priceHighUsd: 200,
    quality: 0.8,
    seenAt: null,
    look: look(axis, lean),
    photos: [1, 2, 3, 4, 5].map((i) => ({
      imageUrl: `https://cdn.shopify.com/s/files/${slug}/${i}.jpg`,
      title: `Piece ${i}`,
      priceUsd: 120,
      productUrl: `https://${slug}.example/products/${i}`,
    })),
    ...extra,
  };
}

// Three quiet menswear labels close together on axis 0, two loud ones on axis 10, one far away.
const quiet = [store("Line of Oslo", 0, 0), store("Winfield", 0, 0.2), store("Suus", 0, 0.4)];
const loud = [store("Neon Riot", 10, 0), store("Acid Club", 10, 0.3)];
const far = store("Kids Party Costumes", 40, 0);
const lowQuality = store("Wholesale Boutique", 0, 0.1, { quality: 0.2 });
const uniqlo: CatalogRecord = {
  ...store("Uniqlo", 0, 0.3),
  kind: "name",
  site: null,
  platform: null,
  country: null,
  priceLowUsd: null,
  priceHighUsd: null,
  seenAt: 14,
};

async function seed() {
  await importCatalog(db, [...quiet, ...loud, far, lowQuality, uniqlo]);
}

async function idOf(user: Awaited<ReturnType<typeof signUp>>, name: string) {
  const found = (await (await user.get(`/api/catalog/brands?q=${encodeURIComponent(name)}`)).json()) as BrandCard[];
  return found.find((b) => b.name === name)!.id;
}

describe("catalog", () => {
  it("requires a session", async () => {
    const app = setup();
    expect((await app.request("/api/catalog/brands?q=oslo")).status).toBe(401);
    expect((await app.request("/api/catalog/for-you")).status).toBe(401);
  });

  it("finds brands by name, stores before names", async () => {
    await seed();
    const user = await signUp(setup());
    const found = (await (await user.get("/api/catalog/brands?q=o")).json()) as BrandCard[];
    expect(found.map((b) => b.name)).toContain("Uniqlo");
    expect(found.findIndex((b) => b.kind === "name")).toBeGreaterThan(found.findIndex((b) => b.kind === "store"));
    const exact = (await (await user.get("/api/catalog/brands?q=uniqlo")).json()) as BrandCard[];
    expect(exact[0]).toMatchObject({ name: "Uniqlo", kind: "name", seenAt: 14, platform: null });
    expect(exact[0]!.photos[0]).toContain("width=400");
  });

  it("lists the closest store brands above the quality bar, never name-only brands", async () => {
    await seed();
    const user = await signUp(setup());
    const detail = (await (await user.get(`/api/catalog/brands/${await idOf(user, "Line of Oslo")}`)).json()) as BrandDetail;
    const names = detail.neighbors.map((n) => n.name);
    expect(names.slice(0, 2)).toEqual(["Winfield", "Suus"]);
    expect(names).not.toContain("Uniqlo");
    expect(names).not.toContain("Wholesale Boutique");
    expect(names).not.toContain("Line of Oslo");
    expect(names.indexOf("Kids Party Costumes")).toBeGreaterThan(names.indexOf("Acid Club"));
    expect(detail.photoDetails).toHaveLength(5);
    expect(detail.personal).toBe(false);
  });

  it("suggests good store brands to start from, skipping ones already voted on", async () => {
    await seed();
    const user = await signUp(setup());
    await user.put(`/api/catalog/brands/${await idOf(user, "Winfield")}/vote`, { verdict: "like" });
    const starters = (await (await user.get("/api/catalog/starters")).json()) as BrandCard[];
    const names = starters.map((b) => b.name);
    expect(names).toHaveLength(5);
    expect(names).not.toContain("Winfield");
    expect(names).not.toContain("Uniqlo");
    expect(names).not.toContain("Wholesale Boutique");
  });

  it("starts from a brand known by name", async () => {
    await seed();
    const user = await signUp(setup());
    const detail = (await (await user.get(`/api/catalog/brands/${await idOf(user, "Uniqlo")}`)).json()) as BrandDetail;
    expect(detail.kind).toBe("name");
    expect(detail.neighbors.slice(0, 3).map((n) => n.name).sort()).toEqual(["Line of Oslo", "Suus", "Winfield"]);
  });

  it("records one vote per person, changes and clears it", async () => {
    await seed();
    const app = setup();
    const zack = await signUp(app);
    const sam = await signUp(app, "sam@example.com");
    const id = await idOf(zack, "Winfield");
    expect((await zack.put(`/api/catalog/brands/${id}/vote`, { verdict: "like" })).status).toBe(204);
    expect((await sam.put(`/api/catalog/brands/${id}/vote`, { verdict: "like" })).status).toBe(204);
    expect((await zack.put(`/api/catalog/brands/${id}/vote`, { verdict: "like" })).status).toBe(204);
    let card = ((await (await zack.get("/api/catalog/brands?q=winfield")).json()) as BrandCard[])[0]!;
    expect(card).toMatchObject({ myVote: "like", likes: 2 });
    await zack.put(`/api/catalog/brands/${id}/vote`, { verdict: "skip" });
    card = ((await (await zack.get("/api/catalog/brands?q=winfield")).json()) as BrandCard[])[0]!;
    expect(card).toMatchObject({ myVote: "skip", likes: 1 });
    await zack.put(`/api/catalog/brands/${id}/vote`, { verdict: null });
    card = ((await (await zack.get("/api/catalog/brands?q=winfield")).json()) as BrandCard[])[0]!;
    expect(card.myVote).toBeNull();
    expect((await zack.put(`/api/catalog/brands/${id}/vote`, { verdict: "love" })).status).toBe(400);
    expect((await zack.put("/api/catalog/brands/00000000-0000-4000-8000-000000000000/vote", { verdict: "like" })).status).toBe(404);
  });

  it("opens For you after five likes and ranks by taste", async () => {
    // Enough loud brands to like five, and unvoted ones on both sides.
    const more = [4, 5, 6, 7, 8, 9].map((k) => store(`Loud ${k}`, 10, k / 20));
    await importCatalog(db, [...quiet, ...loud, ...more, far]);
    const user = await signUp(setup());
    let forYou = (await (await user.get("/api/catalog/for-you")).json()) as ForYou;
    expect(forYou).toEqual({ likes: 0, needed: 5, brands: [] });
    for (const name of ["Neon Riot", "Acid Club", "Loud 4", "Loud 5", "Loud 6"]) {
      await user.put(`/api/catalog/brands/${await idOf(user, name)}/vote`, { verdict: "like" });
    }
    await user.put(`/api/catalog/brands/${await idOf(user, "Line of Oslo")}/vote`, { verdict: "skip" });
    forYou = (await (await user.get("/api/catalog/for-you")).json()) as ForYou;
    expect(forYou.likes).toBe(5);
    const names = forYou.brands.map((b) => b.name);
    expect(names).not.toContain("Neon Riot");
    expect(names).not.toContain("Line of Oslo");
    // The unvoted loud brands come first; each says which like it's close to.
    const picks = forYou.brands.filter((b) => !b.explore);
    expect(picks.slice(0, 3).every((b) => b.name.startsWith("Loud"))).toBe(true);
    expect(picks[0]!.because?.name).toMatch(/Loud|Neon|Acid/);
    const detail = (await (await user.get(`/api/catalog/brands/${await idOf(user, "Winfield")}`)).json()) as BrandDetail;
    expect(detail.personal).toBe(true);
  });

  it("imports onto brands people already added, and keeps same-named stores apart", async () => {
    await db.insert(schema.brand).values({ name: "Winfield", slug: "winfield" });
    const [before] = await db.select().from(schema.brand).where(eq(schema.brand.slug, "winfield"));
    await seed();
    const [after] = await db.select().from(schema.brand).where(eq(schema.brand.slug, "winfield"));
    expect(after!.id).toBe(before!.id);
    expect(after!.domain).toBe("winfield.example");

    const other = store("Winfield", 30, 0, { site: "https://winfield-ny.example" });
    expect(await importCatalog(db, [other, uniqlo])).toEqual({ added: 1, updated: 1, skipped: 0 });
    const winfields = await db.select().from(schema.brand).where(eq(schema.brand.name, "Winfield"));
    expect(winfields.map((b) => b.slug).sort()).toEqual(["winfield", "winfield (winfield-ny.example)"]);

    // A name-only brand never replaces a store with that name.
    expect(await importCatalog(db, [{ ...uniqlo, name: "Suus" }])).toEqual({ added: 0, updated: 0, skipped: 1 });
  });
});
