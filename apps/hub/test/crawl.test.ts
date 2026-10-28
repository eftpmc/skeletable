import type { ServerResponse } from "node:http";
import { schema } from "@skeleton/hub-db";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { shopifyProductSchema, shopifyReading } from "@skeleton/engine";
import { crawlSource, type CrawlOptions } from "../src/engine/crawl.js";
import { addSource, domainOf } from "../src/sources.js";
import { useHubDb } from "./helpers/db.js";
import { html, json, startFixtureServer, type Route } from "./helpers/fixture-server.js";

const db = useHubDb();
const { crawl, listing, reading, source } = schema;

const product = (id: number, price = "120.00", extra: Record<string, unknown> = {}) => ({
  id,
  title: `Piece ${id}`,
  handle: `piece-${id}`,
  body_html: "<p>Heavy <strong>wool</strong>,<br>made in Portugal.</p>",
  vendor: "Maker",
  product_type: "Coat",
  tags: ["Outerwear", "Wool"],
  options: [{ name: "Size" }],
  variants: [
    { id: id * 10, title: "S", option1: "S", price, available: true },
    { id: id * 10 + 1, title: "M", option1: "M", price, available: false },
  ],
  images: [{ src: `//cdn.example/${id}.jpg`, width: 800, height: 1000 }],
  ...extra,
});

/** A fake Shopify store whose products can be changed between crawls. */
async function store(initial: unknown[], routes: Record<string, Route> = {}) {
  const state = { products: initial };
  const server = await startFixtureServer({
    "/products.json": (req, res: ServerResponse) => {
      const params = new URL(req.url ?? "/", "http://x").searchParams;
      const limit = Number(params.get("limit") ?? 30);
      const page = Number(params.get("page") ?? 1);
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ products: state.products.slice((page - 1) * limit, page * limit) }));
    },
    "/": html(`<script>Shopify.currency = {"active":"EUR","rate":"1.0"};</script>`),
    // Shopify's own robots.txt keeps crawlers out of carts.
    "/robots.txt": (_req, res) => res.writeHead(200, { "content-type": "text/plain" }).end("User-agent: *\nDisallow: /cart"),
    ...routes,
  });
  const domain = domainOf(server.url("/"));
  const options: CrawlOptions = { pauseMs: 0, fetch: { allowPrivate: true }, originOf: () => new URL(server.url("/")) };
  closers.push(server.close);
  return { state, domain, options };
}

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

async function approved(input: { domain: string; options: CrawlOptions }) {
  const added = await addSource(db, input.domain, undefined, input.options);
  await db.update(source).set({ status: "approved" }).where(eq(source.id, added.id));
  return added;
}

describe("Shopify reading", () => {
  it("keeps what the store states, in minor units, and no price without a currency", () => {
    const parsed = shopifyProductSchema.parse(product(1, "120.50", { compare_at_price: null }));
    const withCurrency = shopifyReading(parsed, new URL("https://shop.example"), "EUR");
    expect(withCurrency).toMatchObject({
      externalId: "1",
      url: "https://shop.example/products/piece-1",
      description: "Heavy wool, made in Portugal.",
      maker: "Maker",
      productType: "Coat",
      price: { amount: 12050, currency: "EUR" },
      available: true,
      images: [{ url: "https://cdn.example/1.jpg", width: 800, height: 1000 }],
      variants: [{ title: "S", options: { Size: "S" }, available: true }, { title: "M", available: false }],
    });
    expect(shopifyReading(parsed, new URL("https://shop.example"), null).price).toBeUndefined();
  });
});

describe("adding a site", () => {
  it("keys a site by its host, without www or a path", () => {
    expect(domainOf("https://WWW.Maker.example/collections/all")).toBe("maker.example");
    expect(domainOf("maker.example")).toBe("maker.example");
  });

  it("detects a Shopify store and records the evidence and its currency", async () => {
    const shop = await store([product(1)]);
    const added = await addSource(db, shop.domain, undefined, shop.options);
    expect(added).toMatchObject({ created: true, readerId: "shopify" });
    const [site] = await db.select().from(source).where(eq(source.id, added.id));
    expect(site).toMatchObject({ status: "candidate", readerConfig: { currency: "EUR" }, readerEvidence: { feed: "/products.json" } });
    expect(site!.readerAssignedById).not.toBeNull();
    expect((await addSource(db, `http://${shop.domain}/products`, undefined, shop.options)).created).toBe(false);
  });

  it("leaves a site no reader recognises unassigned", async () => {
    const server = await startFixtureServer({ "/": json({}) });
    closers.push(server.close);
    const added = await addSource(db, server.url("/"), undefined, { pauseMs: 0, fetch: { allowPrivate: true }, originOf: () => new URL(server.url("/")) });
    expect(added.readerId).toBeNull();
  });
});

describe("crawling", () => {
  it("stores listings and readings, and only new readings when something changed", async () => {
    const shop = await store([product(1), product(2)]);
    const site = await approved(shop);

    const first = await crawlSource(db, site.id, shop.options);
    expect(first).toMatchObject({ status: "done", seen: 2, added: 2, changed: 0, gone: 0, paused: false });
    const again = await crawlSource(db, site.id, shop.options);
    expect(again).toMatchObject({ seen: 2, added: 0, changed: 0 });
    // A stock movement only touches the shop's own updated time: no new reading.
    shop.state.products = [product(1, undefined, { updated_at: "2026-10-28T09:00:00Z" }), product(2)];
    expect(await crawlSource(db, site.id, shop.options)).toMatchObject({ changed: 0 });

    shop.state.products = [product(1, "99.00"), product(2)];
    expect(await crawlSource(db, site.id, shop.options)).toMatchObject({ changed: 1 });
    const prices = await db.select({ data: reading.data }).from(reading).innerJoin(listing, eq(listing.id, reading.listingId)).where(eq(listing.externalId, "1"));
    expect(prices.map((r) => (r.data as { price: { amount: number } }).price.amount).sort((a, b) => a - b)).toEqual([9900, 12000]);

    const [done] = await db.select().from(crawl).where(eq(crawl.id, first.crawlId));
    expect(done).toMatchObject({ readerId: "shopify", readerVersion: 1, status: "done" });
  });

  it("reads every page of a big store", async () => {
    const shop = await store(Array.from({ length: 260 }, (_, i) => product(i + 1)));
    const site = await approved(shop);
    expect(await crawlSource(db, site.id, shop.options)).toMatchObject({ seen: 260, added: 260 });
  });

  it("marks listings gone when the store drops them", async () => {
    const shop = await store([product(1), product(2), product(3)]);
    const site = await approved(shop);
    await crawlSource(db, site.id, shop.options);
    shop.state.products = [product(1), product(2)];
    expect(await crawlSource(db, site.id, shop.options)).toMatchObject({ gone: 1 });
    const gone = await db.select({ externalId: listing.externalId }).from(listing).where(isNotNull(listing.goneAt));
    expect(gone).toEqual([{ externalId: "3" }]);

    shop.state.products = [product(1), product(2), product(3)];
    await crawlSource(db, site.id, shop.options);
    expect(await db.select().from(listing).where(isNotNull(listing.goneAt))).toEqual([]);
  });

  it("treats a sharp drop as a fault: nothing gone, the site paused", async () => {
    const shop = await store(Array.from({ length: 40 }, (_, i) => product(i + 1)));
    const site = await approved(shop);
    await crawlSource(db, site.id, shop.options);
    shop.state.products = [product(1)];
    expect(await crawlSource(db, site.id, shop.options)).toMatchObject({ status: "done", gone: 0, paused: true });
    expect(await db.select().from(listing).where(and(eq(listing.sourceId, site.id), isNull(listing.goneAt)))).toHaveLength(40);
    const [paused] = await db.select({ status: source.status }).from(source).where(eq(source.id, site.id));
    expect(paused!.status).toBe("paused");
  });

  it("asks a busy store again soon, then reads it", async () => {
    let refused = 0;
    const shop = await store([product(1)]);
    const busy = await startFixtureServer({
      "/products.json": (req, res) => {
        if (refused++ === 0) return res.writeHead(429, { "retry-after": "60" }).end();
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ products: [product(1)] }));
      },
    });
    closers.push(busy.close);
    const waits: number[] = [];
    const options: CrawlOptions = { ...shop.options, originOf: () => new URL(busy.url("/")), sleep: async (ms) => void waits.push(ms) };
    const [added] = await db
      .insert(source)
      .values({ domain: domainOf(busy.url("/")), status: "approved", readerId: "shopify", readerConfig: { currency: "EUR" } })
      .returning({ id: source.id });
    expect(await crawlSource(db, added!.id, options)).toMatchObject({ status: "done", seen: 1 });
    // Shopify says 60 seconds on a first request it serves seconds later; the first retry waits 10.
    expect(waits).toContain(10_000);
  });

  it("reads a store in smaller pages when a page of 250 is too large", async () => {
    const shop = await store(Array.from({ length: 300 }, (_, i) => product(i + 1)));
    const site = await approved(shop);
    const pageBytes = JSON.stringify({ products: shop.state.products.slice(0, 50) }).length;
    const options: CrawlOptions = { ...shop.options, fetch: { ...shop.options.fetch, maxBytes: pageBytes * 2 } };
    expect(await crawlSource(db, site.id, options)).toMatchObject({ status: "done", seen: 300 });
  });

  it("honours robots.txt", async () => {
    const shop = await store([product(1)], {
      "/robots.txt": (_req, res) => res.writeHead(200, { "content-type": "text/plain" }).end("User-agent: *\nDisallow: /products.json"),
    });
    const [added] = await db
      .insert(source)
      .values({ domain: shop.domain, status: "approved", readerId: "shopify", readerConfig: { currency: "EUR" } })
      .returning({ id: source.id });
    expect(await crawlSource(db, added!.id, shop.options)).toMatchObject({ status: "blocked", seen: 0, paused: true });
  });
});
