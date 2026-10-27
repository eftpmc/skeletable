import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { schema } from "@closet/db";
import type { BrandCard, BrandDetail, CategoryCount, ForYou, ItemDetail, ItemFeed, Preferences } from "@closet/shared";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { type CatalogRecord, importCatalog } from "../src/catalog/import.js";
import { importPackIfNew } from "../src/catalog/pack.js";
import { html, startFixtureServer } from "./helpers/fixture-server.js";
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

type Item = CatalogRecord["items"][number];

function store(name: string, axis: number, lean: number, extra: Partial<CatalogRecord> = {}, items: Partial<Item>[] = [{}, {}, {}, {}, {}]): CatalogRecord {
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
    department: "both",
    look: look(axis, lean),
    items: items.map((item, k) => ({
      imageUrl: `https://cdn.shopify.com/s/files/${slug}/${k + 1}.jpg`,
      title: `Piece ${k + 1}`,
      priceUsd: 120,
      productUrl: `https://${slug}.example/products/${k + 1}`,
      category: "tops",
      department: "unisex",
      look: look(axis, lean),
      ...item,
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
    expect(forYou).toEqual({ interested: 0, needed: 5, brands: [] });
    for (const name of ["Neon Riot", "Acid Club", "Loud 4", "Loud 5", "Loud 6"]) {
      await user.put(`/api/catalog/brands/${await idOf(user, name)}/vote`, { verdict: "like" });
    }
    await user.put(`/api/catalog/brands/${await idOf(user, "Line of Oslo")}/vote`, { verdict: "skip" });
    forYou = (await (await user.get("/api/catalog/for-you")).json()) as ForYou;
    expect(forYou.interested).toBe(5);
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

  it("learns taste from brands someone looks at properly, not from quick bounces", async () => {
    const more = [4, 5, 6, 7, 8, 9].map((k) => store(`Loud ${k}`, 10, k / 20));
    await importCatalog(db, [...quiet, ...loud, ...more, far]);
    const user = await signUp(setup());
    const seen = async (name: string, dwellMs: number) =>
      expect((await user.post(`/api/catalog/brands/${await idOf(user, name)}/seen`, { dwellMs })).status).toBe(204);

    // Bounces (a couple of seconds, once) say nothing.
    for (const name of ["Line of Oslo", "Winfield", "Suus"]) await seen(name, 1500);
    let forYou = (await (await user.get("/api/catalog/for-you")).json()) as ForYou;
    expect(forYou.interested).toBe(0);

    // Real looks at four loud brands, plus one opened twice, unlock picks without a single heart.
    for (const name of ["Neon Riot", "Acid Club", "Loud 4", "Loud 5"]) await seen(name, 20_000);
    await seen("Loud 6", 2000);
    await seen("Loud 6", 2000);
    forYou = (await (await user.get("/api/catalog/for-you")).json()) as ForYou;
    expect(forYou.interested).toBe(5);
    const names = forYou.brands.filter((b) => !b.explore).map((b) => b.name);
    expect(names.slice(0, 3).every((n) => n.startsWith("Loud"))).toBe(true);
    // Brands already looked at aren't offered back as news.
    expect(names).not.toContain("Neon Riot");

    // Marking one not for you takes it back out of the taste.
    await user.put(`/api/catalog/brands/${await idOf(user, "Acid Club")}/vote`, { verdict: "skip" });
    forYou = (await (await user.get("/api/catalog/for-you")).json()) as ForYou;
    expect(forYou.interested).toBe(4);
    expect(forYou.brands).toEqual([]);

    expect((await user.post("/api/catalog/brands/00000000-0000-4000-8000-000000000000/seen", { dwellMs: 1000 })).status).toBe(404);
    expect((await user.post(`/api/catalog/brands/${await idOf(user, "Suus")}/seen`, { dwellMs: -5 })).status).toBe(400);
  });

  it("feeds catalog products, leaning toward what someone looks at, never one brand twice in a row", async () => {
    const more = [4, 5, 6, 7, 8, 9].map((k) => store(`Loud ${k}`, 10, k / 20));
    await importCatalog(db, [...quiet, ...loud, ...more, far, lowQuality, uniqlo]);
    const user = await signUp(setup());
    const feed = async (page = 0) => (await (await user.get(`/api/catalog/feed?page=${page}&seed=abc`)).json()) as ItemFeed;

    const first = await feed();
    expect(first.items).toHaveLength(30);
    const all = [...first.items, ...(await feed(1)).items, ...(await feed(2)).items];
    // 12 store brands above the bar, five products each; name-only and low-quality brands never show.
    expect(new Set(all.map((i) => i.id)).size).toBe(60);
    expect(all.some((i) => i.brandName === "Wholesale Boutique" || i.brandName === "Uniqlo")).toBe(false);
    for (let k = 1; k < first.items.length; k++) expect(first.items[k]!.brandId).not.toBe(first.items[k - 1]!.brandId);
    // The same seed gives the same order.
    expect((await feed()).items.map((i) => i.id)).toEqual(first.items.map((i) => i.id));

    // One proper look at a loud brand's item pulls loud brands to the top.
    const loudItem = all.find((i) => i.brandName === "Neon Riot")!;
    expect((await user.post(`/api/catalog/items/${loudItem.id}/seen`, { dwellMs: 30_000 })).status).toBe(204);
    const top = (await feed()).items.slice(0, 6).map((i) => i.brandName);
    expect(top.filter((n) => /Loud|Neon|Acid/.test(n)).length).toBeGreaterThanOrEqual(5);
  });

  it("searches products by brand and title, on the viewer's side of the catalog", async () => {
    const suus = store("Suus", 0, 0, { department: "women" }, [
      { title: "Linen Shirt Dress", category: "dresses", department: "women" },
      { title: "Wool Overshirt", category: "shirts", department: "women" },
    ]);
    const winfield = store("Winfield", 10, 0, { department: "men" }, [
      { title: "Steel Grey Linen Shirt", category: "shirts", department: "men" },
      { title: "Heavy Tee", category: "tops", department: "unisex" },
    ]);
    await importCatalog(db, [suus, winfield, lowQuality]);
    const user = await signUp(setup());
    const search = async (q: string) =>
      ((await (await user.get(`/api/catalog/search?q=${encodeURIComponent(q)}`)).json()) as ItemFeed["items"]).map((i) => i.title);

    // Every word must appear, each at the start of a word: "tee" doesn't find "Steel".
    expect((await search("linen shirt")).sort()).toEqual(["Linen Shirt Dress", "Steel Grey Linen Shirt"]);
    expect(await search("tee")).toEqual(["Heavy Tee"]);
    expect(await search("overshirt")).toEqual(["Wool Overshirt"]);
    // A brand's name finds its products; brands under the quality bar never show.
    expect((await search("winfield")).sort()).toEqual(["Heavy Tee", "Steel Grey Linen Shirt"]);
    expect(await search("wholesale")).toEqual([]);
    expect(await search("   ")).toEqual([]);

    await user.patch("/api/preferences", { shopFor: "men" });
    expect(await search("linen shirt")).toEqual(["Steel Grey Linen Shirt"]);
  });

  it("opens an item with more from its brand and more like it", async () => {
    await importCatalog(db, [...quiet, ...loud, far]);
    const user = await signUp(setup());
    const { items } = (await (await user.get("/api/catalog/feed?seed=x")).json()) as ItemFeed;
    const oslo = items.find((i) => i.brandName === "Line of Oslo")!;
    const detail = (await (await user.get(`/api/catalog/items/${oslo.id}`)).json()) as ItemDetail;
    expect(detail.item.id).toBe(oslo.id);
    expect(detail.brand.name).toBe("Line of Oslo");
    expect(detail.moreFromBrand).toHaveLength(4);
    expect(detail.moreFromBrand.every((i) => i.brandName === "Line of Oslo" && i.id !== oslo.id)).toBe(true);
    // The closest looks first: the other quiet labels before the loud ones.
    expect(detail.moreLikeThis.slice(0, 2).map((i) => i.brandName).sort()).toEqual(["Suus", "Winfield"]);
    expect(detail.savedProductId).toBeNull();
    expect((await user.get("/api/catalog/items/not-an-item")).status).toBe(404);
    expect((await user.get("/api/catalog/items/00000000-0000-4000-8000-000000000000")).status).toBe(404);
  });

  it("saves an item by reading its page and tracking its price", async () => {
    const shop = await startFixtureServer({
      "/products/oslo-coat": html(`<html><head><title>Oslo Coat</title>
        <script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Oslo Coat","brand":{"@type":"Brand","name":"Line of Oslo"},
        "image":"https://cdn.example/coat.jpg","offers":{"@type":"Offer","price":"240.00","priceCurrency":"USD"}}</script></head><body></body></html>`),
    });
    try {
      const oslo = store("Line of Oslo", 0, 0);
      oslo.items[0]!.productUrl = shop.url("/products/oslo-coat");
      await importCatalog(db, [oslo, ...loud]);
      const user = await signUp(setup({ ALLOW_PRIVATE_FETCH: "true" }));
      const { items } = (await (await user.get("/api/catalog/feed?seed=x")).json()) as ItemFeed;
      const coat = items.find((i) => i.productUrl === shop.url("/products/oslo-coat"))!;

      const saved = await user.post(`/api/catalog/items/${coat.id}/save`);
      expect(saved.status).toBe(200);
      const { productId } = (await saved.json()) as { productId: string };
      const watches = (await (await user.get("/api/watches")).json()) as { productId: string; title: string }[];
      expect(watches).toEqual([expect.objectContaining({ productId, title: "Oslo Coat" })]);
      const detail = (await (await user.get(`/api/catalog/items/${coat.id}`)).json()) as ItemDetail;
      expect(detail.savedProductId).toBe(productId);

      // A page that can't be read says so and saves nothing.
      const other = items.find((i) => i.brandName === "Neon Riot")!;
      expect((await user.post(`/api/catalog/items/${other.id}/save`)).status).toBe(422);
    } finally {
      await shop.close();
    }
  });

  it("imports a catalog pack once, and again only when it changes", async () => {
    await db.delete(schema.catalogPack);
    const dir = mkdtempSync(path.join(tmpdir(), "closet-pack-"));
    // The pack stores product vectors as 512 signed bytes in base64.
    const packed = (v: number[]) => Buffer.from(Int8Array.from(v.map((x) => Math.round(x * 127)))).toString("base64");
    const write = (records: CatalogRecord[]) => {
      const file = path.join(dir, `pack-${records.length}.jsonl.gz`);
      const lines = records.map((r) => JSON.stringify({ ...r, items: r.items.map((i) => ({ ...i, look: packed(i.look) })) }));
      writeFileSync(file, gzipSync(lines.join("\n") + "\n"));
      return file;
    };
    const first = write([...quiet, uniqlo]);
    expect(await importPackIfNew(db, first)).toMatchObject({ imported: true, added: 4 });
    expect(await importPackIfNew(db, first)).toMatchObject({ imported: false });
    expect(await importPackIfNew(db, write([...quiet, uniqlo, ...loud]))).toMatchObject({ imported: true, added: 2, updated: 4 });
    const user = await signUp(setup());
    expect(((await (await user.get("/api/catalog/brands?q=acid")).json()) as BrandCard[])[0]?.name).toBe("Acid Club");
    // Product vectors come through the bytes intact, normalized.
    const [item] = await db.select().from(schema.catalogItem).limit(1);
    expect(Math.hypot(...item!.look)).toBeCloseTo(1, 3);
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
  it("keeps a product's id across imports while its page stays, and drops products that are gone", async () => {
    const oslo = store("Line of Oslo", 0, 0);
    await importCatalog(db, [oslo]);
    const before = await db.select().from(schema.catalogItem).orderBy(schema.catalogItem.position);
    expect(before).toHaveLength(5);
    // The store's newest piece comes first now, piece 5 sold out, and piece 1 got cheaper.
    const fresh = { ...oslo.items[0]!, productUrl: "https://lineofoslo.example/products/new", title: "New" };
    const again = { ...oslo, items: [fresh, { ...oslo.items[0]!, priceUsd: 90 }, ...oslo.items.slice(1, 4)] };
    await importCatalog(db, [again]);
    const after = await db.select().from(schema.catalogItem).orderBy(schema.catalogItem.position);
    expect(after.map((i) => i.title)).toEqual(["New", "Piece 1", "Piece 2", "Piece 3", "Piece 4"]);
    expect(after[1]!.id).toBe(before[0]!.id);
    expect(after[1]!.priceUsd).toBe(90);
  });

  it("saves and reads preferences, rejecting what isn't one", async () => {
    const user = await signUp(setup());
    expect(await (await user.get("/api/preferences")).json()).toEqual({ shopFor: null, priceMaxUsd: null, hiddenCategories: [] });
    let res = await user.patch("/api/preferences", { shopFor: "women" });
    expect(res.status).toBe(200);
    res = await user.patch("/api/preferences", { priceMaxUsd: 300, hiddenCategories: ["swimwear", "swimwear", "intimates"] });
    expect(await res.json()).toEqual({ shopFor: "women", priceMaxUsd: 300, hiddenCategories: ["swimwear", "intimates"] });
    expect((await user.patch("/api/preferences", { shopFor: "kids" })).status).toBe(400);
    expect((await user.patch("/api/preferences", { hiddenCategories: ["gadgets"] })).status).toBe(400);
    expect((await user.patch("/api/preferences", { priceMaxUsd: -1 })).status).toBe(400);
    res = await user.patch("/api/preferences", { priceMaxUsd: null });
    expect(((await res.json()) as Preferences).priceMaxUsd).toBeNull();
    // Each person has their own.
    const other = await signUp(setup(), "sam@example.com");
    expect(((await (await other.get("/api/preferences")).json()) as Preferences).shopFor).toBeNull();
  });

  it("shows each person their side of the catalog, by category, without what they hid", async () => {
    const women = store("Suus", 0, 0, { department: "women" }, [
      { category: "dresses", department: "women" },
      { category: "dresses", department: "women" },
      { category: "swimwear", department: "women" },
      { category: "tops", department: "unisex" },
    ]);
    const men = store("Winfield", 10, 0, { department: "men" }, [
      { category: "shirts", department: "men" },
      { category: "outerwear", department: "men" },
      { category: "tops", department: "unisex" },
    ]);
    await importCatalog(db, [women, men]);
    const user = await signUp(setup());
    const feed = async (query = "") => ((await (await user.get(`/api/catalog/feed?seed=x${query}`)).json()) as ItemFeed).items;
    const cats = async () => ((await (await user.get("/api/catalog/categories")).json()) as CategoryCount[]).map((c) => `${c.id}:${c.count}`);

    // Before answering, everything; categories in the taxonomy's order.
    expect(await feed()).toHaveLength(7);
    expect(await cats()).toEqual(["tops:2", "shirts:1", "outerwear:1", "dresses:2", "swimwear:1"]);

    await user.patch("/api/preferences", { shopFor: "men" });
    expect((await feed()).map((i) => i.department).sort()).toEqual(["men", "men", "unisex", "unisex"]);
    expect(await cats()).toEqual(["tops:2", "shirts:1", "outerwear:1"]);

    await user.patch("/api/preferences", { shopFor: "women", hiddenCategories: ["swimwear"] });
    const items = await feed();
    expect(items.map((i) => i.category).sort()).toEqual(["dresses", "dresses", "tops", "tops"]);
    expect(await cats()).toEqual(["tops:2", "dresses:2"]);
    // Asking for one category shows it, hidden or not; an unknown one is ignored.
    expect((await feed("&category=dresses")).map((i) => i.category)).toEqual(["dresses", "dresses"]);
    expect((await feed("&category=swimwear")).map((i) => i.category)).toEqual(["swimwear"]);
    expect(await feed("&category=gadgets")).toHaveLength(4);
    // A group shows its categories, still without the hidden ones; an unknown group is ignored.
    expect((await feed("&group=clothing")).map((i) => i.category).sort()).toEqual(["dresses", "dresses", "tops", "tops"]);
    expect(await feed("&group=accessories")).toEqual([]);
    expect(await feed("&group=gadgets")).toHaveLength(4);

    // Brands that only make the other side don't come up as neighbors either.
    const detail = (await (await user.get(`/api/catalog/brands/${await idOf(user, "Suus")}`)).json()) as BrandDetail;
    expect(detail.department).toBe("women");
    expect(detail.neighbors.map((n) => n.name)).not.toContain("Winfield");
  });

  it("ranks products over the price cap lower, without hiding them", async () => {
    const pricey = store("Line of Oslo", 0, 0, {}, [{ priceUsd: 900 }, { priceUsd: 950 }, { priceUsd: 80 }]);
    await importCatalog(db, [pricey]);
    const user = await signUp(setup());
    await user.patch("/api/preferences", { priceMaxUsd: 100 });
    const items = ((await (await user.get("/api/catalog/feed?seed=x")).json()) as ItemFeed).items;
    expect(items[0]!.priceUsd).toBe(80);
    expect(items).toHaveLength(3);
  });

  it("learns taste from the products someone opens and saves", async () => {
    // Two brands on each side; the loud brand's second product looks quiet.
    const quietOne = store("Line of Oslo", 0, 0);
    const loudOne = store("Neon Riot", 10, 0, {}, [{}, { look: look(0, 0.1) }, {}]);
    await importCatalog(db, [quietOne, loudOne, ...loud.slice(1), ...quiet.slice(1)]);
    const user = await signUp(setup());
    const items = ((await (await user.get("/api/catalog/feed?seed=x")).json()) as ItemFeed).items;
    // A real look at the quiet-looking product of a loud brand pulls quiet products up, not loud ones.
    const odd = items.find((i) => i.brandName === "Neon Riot" && i.title === "Piece 2")!;
    expect((await user.post(`/api/catalog/items/${odd.id}/seen`, { dwellMs: 30_000 })).status).toBe(204);
    const top = ((await (await user.get("/api/catalog/feed?seed=x")).json()) as ItemFeed).items.slice(0, 4);
    expect(top.filter((i) => ["Line of Oslo", "Winfield", "Suus"].includes(i.brandName) || i.id === odd.id).length).toBeGreaterThanOrEqual(3);
    const [row] = await db.select().from(schema.itemView);
    expect(row).toMatchObject({ itemId: odd.id, views: 1, dwellMs: 30_000, saved: 0 });

    // Taste from products alone opens For you too, with no brand to name as the reason.
    for (const item of items.slice(0, 5)) await user.post(`/api/catalog/items/${item.id}/seen`, { dwellMs: 30_000 });
    const res = await user.get("/api/catalog/for-you");
    expect(res.status).toBe(200);
    const forYou = (await res.json()) as ForYou;
    expect(forYou.interested).toBeGreaterThanOrEqual(5);
    expect(forYou.brands.every((b) => b.because === null)).toBe(true);
  });
});
