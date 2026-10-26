import http from "node:http";
import type { AddressInfo } from "node:net";
import type { ProductDetail, SearchResponse } from "@closet/shared";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bestBuySource } from "../src/search/sources/bestbuy.js";
import { ebaySource } from "../src/search/sources/ebay.js";
import type { Source } from "../src/search/sources/index.js";
import { shopifySource } from "../src/search/sources/shopify.js";
import { signUp, useTestApp } from "./helpers/setup.js";

const { setup } = useTestApp();

/** One local server playing Best Buy, eBay, a used Shopify shop and a brand's product page. */
let server: http.Server;
let base = "";
let host = "";
const seen: { ebayAuth?: string; bestBuyPath?: string; ebayFilter?: string | null; iconHits: number } = { iconHits: 0 };
let touchIcon: Buffer;

beforeAll(async () => {
  touchIcon = await sharp({ create: { width: 180, height: 180, channels: 4, background: "#e11" } }).png().toBuffer();
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const json = (body: unknown) => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(body));

    if (url.pathname.startsWith("/v1/products(")) {
      seen.bestBuyPath = decodeURIComponent(url.pathname);
      return json({
        products: [
          {
            name: "Sony WH-1000XM5 Wireless Noise Cancelling Headphones - Black",
            url: `${base}/bestbuy/xm5`,
            salePrice: 279.99,
            image: `${base}/img/xm5.jpg`,
            upc: "027242923232",
            manufacturer: "Sony",
            modelNumber: "WH1000XM5/B",
            condition: "New",
            onlineAvailability: true,
          },
        ],
      });
    }
    if (url.pathname === "/identity/v1/oauth2/token" && req.method === "POST") {
      return json({ access_token: "test-token", expires_in: 7200 });
    }
    if (url.pathname === "/buy/browse/v1/item_summary/search") {
      seen.ebayAuth = req.headers.authorization;
      seen.ebayFilter = url.searchParams.get("filter");
      return json({
        itemSummaries: [
          { title: "Sony WH-1000XM5 Wireless Noise Canceling Headphones Black", itemWebUrl: `${base}/ebay/1`, price: { value: "298.00", currency: "USD" }, conditionId: "1000", gtin: "0027242923232" },
          { title: "Sony WH-1000XM5 Headphones - Certified Refurbished", itemWebUrl: `${base}/ebay/2`, price: { value: "189.00", currency: "USD" }, conditionId: "2000" },
          { title: "Replacement Ear Pads for Sony WH-1000XM5", itemWebUrl: `${base}/ebay/3`, price: { value: "19.99", currency: "USD" }, conditionId: "1000" },
          { title: "Bose QuietComfort Ultra", itemWebUrl: `${base}/ebay/4`, price: { value: "329.00", currency: "USD" }, conditionId: "1000" },
        ],
      });
    }
    if (url.pathname === "/search/suggest.json") {
      return json({
        resources: {
          results: {
            products: [
              { title: "Sony WH-1000XM5 headphones (good condition)", url: "/products/sony-xm5?_pos=1", price: "160.00", vendor: "Sony", image: "//cdn.example.com/xm5.jpg", available: true },
            ],
          },
        },
      });
    }
    if (url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html" });
      return res.end(`<html><head><link rel="icon" sizes="32x32" href="/small.png"><link rel="apple-touch-icon" href="/touch.png"></head></html>`);
    }
    if (url.pathname === "/touch.png") {
      seen.iconHits++;
      return res.writeHead(200, { "content-type": "image/png" }).end(touchIcon);
    }
    if (url.pathname === "/brand/xm5") {
      res.writeHead(200, { "content-type": "text/html" });
      return res.end(`<html><head><script type="application/ld+json">${JSON.stringify({
        "@type": "Product",
        name: "WH-1000XM5 Wireless Noise Canceling Headphones",
        brand: { name: "Sony" },
        gtin12: "027242923232",
        image: "/img/xm5.jpg",
        offers: { price: "399.99", priceCurrency: "USD" },
      })}</script></head></html>`);
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  host = `127.0.0.1:${port}`;
  base = `http://${host}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

function testSources(extra: Source[] = []) {
  const sources = [
    bestBuySource({ apiKey: "key", apiBase: base }),
    ebaySource({ clientId: "id", clientSecret: "secret", marketplace: "EBAY_US", apiBase: base }),
    shopifySource([{ domain: host, name: "Second Spin", condition: "used", currency: "USD" }], { protocol: "http" }),
    ...extra,
  ];
  return { sources, info: sources.map((s) => ({ id: s.id, label: s.label, enabled: true, needs: null })) };
}

async function client(extra: Source[] = []) {
  const app = setup({ ALLOW_PRIVATE_FETCH: "true", SHOPIFY_PROTOCOL: "http" }, { sources: testSources(extra) });
  return signUp(app);
}

describe("search", () => {
  it("requires a session", async () => {
    const response = await setup().request("/api/search?q=sony");
    expect(response.status).toBe(401);
  });

  it("searches every source and groups the same product across stores", async () => {
    const user = await client();
    const response = await user.get("/api/search?q=sony%20wh-1000xm5%20headphones");
    expect(response.status).toBe(200);
    const result = (await response.json()) as SearchResponse;

    expect(result.sources.map((s) => [s.id, s.status])).toEqual([
      ["bestbuy", "ok"],
      ["ebay", "ok"],
      ["shopify", "ok"],
    ]);
    // New (Best Buy + eBay, same GTIN), refurb (eBay, same model code) and used (Shopify) all group together.
    // Ear pads (accessory) and Bose (irrelevant) are dropped.
    expect(result.results).toHaveLength(1);
    expect(result.total).toBe(4);
    expect(result.storeCount).toBe(3);
    const card = result.results[0]!;
    expect(card.offerCount).toBe(4);
    // Named after the clean new listing with a barcode, not the cheapest used one.
    expect(card.title).toBe("Sony WH-1000XM5 Wireless Noise Cancelling Headphones - Black");
    expect(card.best).toMatchObject({ priceCents: 16000, condition: "used", store: { name: "Second Spin" } });
    expect(card.best.url).toBe(`${base}/products/sony-xm5`);

    expect(seen.ebayAuth).toBe("Bearer test-token");
    expect(seen.bestBuyPath).toContain("search=sony&search=wh&search=1000xm5&search=headphones");
  });

  it("keeps terse listings of a matching product", async () => {
    const user = await client();
    // The used listing ("Sony WH-1000XM5 headphones (good condition)") lacks "wireless" and "noise",
    // but it's the same product as listings that match.
    const result = (await (await user.get("/api/search?q=sony%20wireless%20noise%20headphones&condition=used")).json()) as SearchResponse;
    expect(result.results.map((r) => r.best.priceCents)).toEqual([16000]);
  });

  it("filters by condition and max price", async () => {
    const user = await client();
    const used = (await (await user.get("/api/search?q=sony%20wh-1000xm5&condition=refurb")).json()) as SearchResponse;
    expect(used.results.map((r) => r.best.condition)).toEqual(["refurb"]);

    const cheap = (await (await user.get("/api/search?q=sony%20wh-1000xm5&max=170")).json()) as SearchResponse;
    expect(cheap.results.map((r) => r.best.priceCents)).toEqual([16000]);
  });

  it("keeps going when a source fails", async () => {
    const broken: Source = { id: "broken", label: "Broken", search: async () => { throw new Error("down"); } };
    const user = await client([broken]);
    const result = (await (await user.get("/api/search?q=sony%20wh-1000xm5")).json()) as SearchResponse;
    expect(result.sources.find((s) => s.id === "broken")?.status).toBe("error");
    expect(result.results).toHaveLength(1);
  });

  it("validates the query", async () => {
    const user = await client();
    expect((await user.get("/api/search?q=")).status).toBe(400);
    expect((await user.get("/api/search?q=x&condition=mint")).status).toBe(400);
  });
});

describe("products", () => {
  it("shows the best offer and a verdict for each condition", async () => {
    const user = await client();
    const result = (await (await user.get("/api/search?q=sony%20wh-1000xm5")).json()) as SearchResponse;
    const detail = (await (await user.get(`/api/products/${result.results[0]!.productId}`)).json()) as ProductDetail;

    expect(detail.gtin).toBe("00027242923232");
    expect(detail.offers.map((o) => o.priceCents)).toEqual([16000, 18900, 27999, 29800]);
    const byCondition = Object.fromEntries(detail.conditions.map((c) => [c.condition, c]));
    expect(byCondition.new).toMatchObject({
      count: 2,
      best: { priceCents: 27999, store: { name: "Best Buy" } },
      verdict: { label: "good", text: "$18 less than the next store" },
    });
    expect(byCondition.refurb).toMatchObject({ count: 1, best: { priceCents: 18900 }, verdict: { label: "unknown" } });
    expect(byCondition.used).toMatchObject({ count: 1, best: { priceCents: 16000 } });
  });

  it("returns 404 for unknown products", async () => {
    const user = await client();
    expect((await user.get("/api/products/00000000-0000-0000-0000-000000000000")).status).toBe(404);
    expect((await user.get("/api/products/nope")).status).toBe(404);
  });
});

describe("pasting a link", () => {
  it("reads the page and finds the same product at other stores", async () => {
    const user = await client();
    const response = await user.post("/api/search/link", { url: `${base}/brand/xm5` });
    expect(response.status).toBe(200);
    const { productId } = (await response.json()) as { productId: string };

    const detail = (await (await user.get(`/api/products/${productId}`)).json()) as ProductDetail;
    const stores = detail.offers.map((o) => o.store.name).sort();
    expect(stores).toEqual(["127.0.0.1", "Best Buy", "Second Spin", "eBay", "eBay"]);
  });

  it("explains pages without a product", async () => {
    const user = await client();
    const response = await user.post("/api/search/link", { url: `${base}/missing` });
    expect(response.status).toBe(422);
  });
});

describe("sources", () => {
  it("lists which sources are enabled", async () => {
    const user = await signUp(setup({ BESTBUY_API_KEY: "k" }));
    const info = (await (await user.get("/api/sources")).json()) as { id: string; enabled: boolean }[];
    expect(Object.fromEntries(info.map((s) => [s.id, s.enabled]))).toEqual({ shopify: false, ebay: false, bestbuy: true });
  });
});

describe("store icons", () => {
  it("serves a store's own icon at 64px, fetched once", async () => {
    const user = await client();
    await user.get("/api/search?q=sony%20wh-1000xm5%20headphones");
    const before = seen.iconHits;

    const response = await user.get(`/api/store-icons/${host}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    const meta = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
    expect([meta.width, meta.height]).toEqual([64, 64]);

    expect((await user.get(`/api/store-icons/${host}`)).status).toBe(200);
    expect(seen.iconHits - before).toBe(1);
  });

  it("only fetches icons for stores we have offers from", async () => {
    const user = await client();
    expect((await user.get("/api/store-icons/example.org")).status).toBe(404);
    expect((await user.get("/api/store-icons/..%2Fetc")).status).toBe(404);
  });
});
