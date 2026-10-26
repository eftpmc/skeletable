import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fetchLinkPreview, parseProductPage } from "../src/closet/link-preview.js";
import { html, json, startFixtureServer } from "./helpers/fixture-server.js";

const jsonLdPage = `<!doctype html><html><head>
<title>Detroit Jacket | Carhartt WIP</title>
<meta property="og:site_name" content="Carhartt WIP">
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[
  {"@type":"BreadcrumbList","itemListElement":[]},
  {"@type":"Product","name":"Detroit Jacket","brand":{"@type":"Brand","name":"Carhartt WIP"},
   "color":"Hamilton Brown","category":"Jackets",
   "image":["/img/detroit-front.jpg",{"@type":"ImageObject","url":"https://cdn.example.com/detroit-back.jpg"}],
   "offers":{"@type":"AggregateOffer","lowPrice":"198.00","priceCurrency":"USD"}}
]}
</script></head><body></body></html>`;

const ogOnlyPage = `<html><head>
<meta property="og:title" content="Relaxed Straight Jean &amp; Belt – Levi&#39;s">
<meta property="og:site_name" content="Levi's">
<meta property="og:image" content="//images.example.com/jean.jpg">
<meta property="product:price:amount" content="79.50">
<meta property="product:price:currency" content="USD">
</head></html>`;

describe("parseProductPage", () => {
  it("reads JSON-LD products inside @graph", () => {
    const preview = parseProductPage(jsonLdPage, "https://shop.example.com/p/detroit");
    expect(preview).toMatchObject({
      title: "Detroit Jacket",
      brand: "Carhartt WIP",
      priceCents: 19800,
      currency: "USD",
      category: "clothing",
      colors: ["brown"],
      siteName: "Carhartt WIP",
    });
    expect(preview.images).toEqual([
      "https://shop.example.com/img/detroit-front.jpg",
      "https://cdn.example.com/detroit-back.jpg",
    ]);
  });

  it("falls back to OpenGraph and cleans the title", () => {
    const preview = parseProductPage(ogOnlyPage, "https://www.example.com/jean");
    expect(preview).toMatchObject({
      title: "Relaxed Straight Jean & Belt",
      brand: null,
      priceCents: 7950,
      currency: "USD",
      category: "accessories",
      siteName: "Levi's",
    });
    expect(preview.images).toEqual(["https://images.example.com/jean.jpg"]);
  });

  it("reads ProductGroup variants", () => {
    const page = `<script type="application/ld+json">${JSON.stringify({
      "@type": "ProductGroup",
      name: "Oxford Shirt",
      brand: "Uniqlo",
      hasVariant: [{ "@type": "Product", image: "https://x.example/blue.jpg", offers: { price: 39.9, priceCurrency: "USD" } }],
    })}</script>`;
    expect(parseProductPage(page, "https://x.example/")).toMatchObject({
      title: "Oxford Shirt",
      brand: "Uniqlo",
      priceCents: 3990,
      images: ["https://x.example/blue.jpg"],
      category: "clothing",
    });
  });

  it("survives broken JSON-LD and empty pages", () => {
    const preview = parseProductPage('<script type="application/ld+json">{oops</script><title>Plain</title>', "https://x.example/");
    expect(preview.title).toBe("Plain");
    expect(preview.images).toEqual([]);
  });
});

describe("fetchLinkPreview", () => {
  let server: Awaited<ReturnType<typeof startFixtureServer>>;

  beforeAll(async () => {
    server = await startFixtureServer({
      "/products/heavyweight-tee": html(
        `<html><head><title>Heavyweight Tee</title><script src="https://cdn.shopify.com/s/app.js"></script></head></html>`,
      ),
      "/products/heavyweight-tee.js": json({
        title: "Heavyweight Tee",
        vendor: "Camber",
        price: 4200,
        type: "T-Shirts",
        images: ["//cdn.shopify.com/files/tee.jpg"],
      }),
    });
  });

  afterAll(() => server.close());

  it("fills gaps from Shopify's product JSON", async () => {
    const preview = await fetchLinkPreview(server.url("/products/heavyweight-tee"), { allowPrivate: true });
    expect(preview).toMatchObject({
      title: "Heavyweight Tee",
      brand: "Camber",
      priceCents: 4200,
      category: "clothing",
      images: ["http://cdn.shopify.com/files/tee.jpg"],
    });
  });
});
