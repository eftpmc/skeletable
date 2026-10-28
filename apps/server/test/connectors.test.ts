import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pageConnector, shopifyConnector, reconcileProduct } from "../src/catalog/connectors/index.js";
import { readStorefront } from "@skeleton/readers";
import { fetchLinkPreview } from "../src/closet/link-preview.js";
import { html, json, redirect, startFixtureServer } from "./helpers/fixture-server.js";

const product = `<script type="application/ld+json">${JSON.stringify({
  "@type": "Product", name: "Drop Jacket", brand: "Independent Brand",
  offers: { price: "120", priceCurrency: "USD" },
})}</script>`;
const options = { allowPrivate: true };

describe("store connectors", () => {
  let server: Awaited<ReturnType<typeof startFixtureServer>>;
  let closed = false;
  let feedRequests = 0;
  beforeAll(async () => {
    server = await startFixtureServer({
      "/": (req, res) => closed
        ? redirect("/password")(req, res)
        : html('<title>Independent shop</title><a href="/p/jacket">Jacket</a><a href="https://elsewhere.example/p/item">External</a>')(req, res),
      "/products.json": (req, res) => { feedRequests++; json({ products: [{ handle: "jacket" }] })(req, res); },
      "/p/jacket": html(product),
      "/products/jacket": (req, res) => closed ? redirect("/password")(req, res) : html(product)(req, res),
      "/password": html('<title>Next drop</title><form action="/password"><input type="password"></form>'),
      "/maintenance": (_req, res) => res.writeHead(503).end("<h1>Under maintenance</h1>"),
      "/rate-limit": (_req, res) => res.writeHead(429).end("Slow down"),
      "/error": (_req, res) => res.writeHead(503).end("Unavailable"),
      "/account": html('<title>Shop</title><form action="/account/login"><input type="password"></form>'),
      "/closed": html("<h1>Store temporarily closed</h1>"),
      "/footer": html("<h1>Shop</h1><footer>Our store is closed on Sundays</footer>"),
      "/empty": html("<h1>New collection coming soon</h1>"),
      "/products/shirt": html('<script>Shopify.shop = "example";</script><meta property="og:title" content="Shirt">'),
      "/products/shirt.js": json({ title: "Shirt", vendor: "Small Brand", price: 4500, images: ["/shirt.jpg"] }),
    });
  });
  afterAll(async () => server.close());

  it("discovers and reads a non-Shopify product through the same contract", async () => {
    const found = await pageConnector.discover(server.url("/"), options);
    expect(found.productUrls).toEqual([server.url("/p/jacket")]);
    expect(found.complete).toBe(false);
    const read = await pageConnector.readProduct(found.productUrls[0]!, options);
    expect(read.observation.state).toBe("open");
    expect(read.product).toMatchObject({ title: "Drop Jacket", priceCents: 12000 });
  });

  it("discovers Shopify products without treating the first page as a full inventory", async () => {
    const found = await shopifyConnector.discover(server.url("/"), options);
    expect(found.productUrls).toEqual([server.url("/products/jacket")]);
    expect(found.complete).toBe(false);
  });

  it("reads Shopify product JSON when the page has incomplete metadata", async () => {
    const read = await shopifyConnector.readProduct(server.url("/products/shirt"), options);
    expect(read.product).toMatchObject({ title: "Shirt", brand: "Small Brand", priceCents: 4500 });
  });

  it("preserves a product through a drop closure and reopening without resetting its baseline", async () => {
    const url = server.url("/products/jacket");
    const original = reconcileProduct(null, await shopifyConnector.readProduct(url, options));
    const requestsBefore = feedRequests;
    closed = true;
    try {
      const discovery = await shopifyConnector.discover(server.url("/"), options);
      expect(discovery.observation.state).toBe("locked");
      expect(discovery.productUrls).toEqual([]);
      expect(feedRequests).toBe(requestsBefore);
      const read = await shopifyConnector.readProduct(url, options);
      expect(read.product).toBeNull();
      const retained = reconcileProduct(original, read);
      expect(retained.product).toEqual(original.product);
      expect(retained.lastSuccessfulAt).toBe(original.lastSuccessfulAt);
      await expect(fetchLinkPreview(url, options)).rejects.toMatchObject({ observation: { state: "locked" } });
      closed = false;
      const reopened = reconcileProduct(retained, await shopifyConnector.readProduct(url, options));
      expect(reopened.observation.state).toBe("open");
      expect(reopened.product).toEqual(original.product);
    } finally { closed = false; }
  });

  it.each([
    ["/maintenance", "maintenance"], ["/rate-limit", "restricted"], ["/error", "unavailable"],
    ["/missing", "unknown"], ["/account", "open"], ["/closed", "locked"], ["/footer", "open"],
  ])("classifies %s as %s without inferring product stock", async (path, state) => {
    expect((await readStorefront(server.url(path), options)).observation.state).toBe(state);
  });

  it("retains the last product when an accessible page has no product data", async () => {
    const original = reconcileProduct(null, await pageConnector.readProduct(server.url("/p/jacket"), options));
    const next = reconcileProduct(original, await pageConnector.readProduct(server.url("/empty"), options));
    expect(next.product).toEqual(original.product);
    expect(next.lastSuccessfulAt).toBe(original.lastSuccessfulAt);
  });

  it("keeps private network protection enabled by default", async () => {
    const read = await pageConnector.readProduct(server.url("/p/jacket"));
    expect(read.product).toBeNull();
    expect(read.observation.state).toBe("unavailable");
  });
});
