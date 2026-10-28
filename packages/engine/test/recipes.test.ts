import { describe, expect, it } from "vitest";
import { anyRecipeSchema, catalogRecipeSchema, readFields, readProductPage, readWithRecipe, reviewedRecipeFor, type CatalogRecipe } from "../src/index.js";

const url = "https://studio.example/shop/bowl";
const next = (data: unknown) => `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>`;
const ld = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
const recipe = (fields: Partial<CatalogRecipe>): CatalogRecipe => catalogRecipeSchema.parse({ format: 2, pathPrefix: "/shop/", ...fields });

describe("recipes, field by field", () => {
  it("reads from the JSON a page embeds for its own scripts, prices in cents when the recipe says so", () => {
    const html = `<html><head><meta property="og:image" content="/img/bowl.jpg"></head><body>${next({
      props: { pageProps: { product: { name: "Stoneware bowl", priceCents: 4050, currency: "EUR", stock: true } } },
    })}</body></html>`;
    const { reading, issues } = readProductPage(
      html,
      url,
      recipe({
        title: { json: "props.pageProps.product.name" },
        price: { json: "props.pageProps.product.priceCents" },
        priceUnit: "minor",
        currency: { json: "props.pageProps.product.currency" },
        available: { from: { json: "props.pageProps.product.stock" } },
      }),
    );
    expect(issues).toEqual([]);
    expect(reading).toMatchObject({
      title: "Stoneware bowl",
      price: { amount: 4050, currency: "EUR" },
      available: true,
      images: [{ url: "https://studio.example/img/bowl.jpg" }],
    });
  });

  it("takes the page's structured data for every field the recipe leaves out", () => {
    const html = `<html><head>${ld({
      "@type": "Product",
      name: "Stoneware bowl",
      brand: { name: "Studio Kiln" },
      gtin13: "4006381333931",
      image: "https://cdn.example/bowl.jpg",
      offers: { price: "40.50", priceCurrency: "EUR", availability: "https://schema.org/InStock" },
    })}</head><body><span class="now">€35,00</span></body></html>`;
    const { reading } = readProductPage(html, url, recipe({ price: { select: ".now" } }));
    expect(reading).toMatchObject({
      title: "Stoneware bowl",
      maker: "Studio Kiln",
      price: { amount: 3500, currency: "EUR" },
      available: true,
      identifiers: { gtin: "4006381333931" },
    });
  });

  it("falls back to structured data when the recipe's place is gone, and says so", () => {
    const html = `<html><head>${ld({ "@type": "Product", name: "Bowl", image: "/b.jpg", offers: { price: "40", priceCurrency: "USD" } })}</head></html>`;
    const { reading, issues } = readProductPage(html, url, recipe({ price: { select: ".price" } }));
    expect(reading?.price).toEqual({ amount: 4000, currency: "USD" });
    expect(issues).toEqual(["price: expected one element, found 0"]);
  });

  it("tries a list of places in order and keeps the first usable value", () => {
    const html = `<h1>Bowl</h1><span class="price">call us</span><span class="sale">$12.00</span><meta property="og:image" content="/b.jpg">`;
    const { reading, issues } = readProductPage(
      html,
      url,
      recipe({ title: { select: "h1" }, price: [{ select: ".price" }, { select: ".sale" }], currency: { constant: "USD" } }),
    );
    expect(reading?.price).toEqual({ amount: 1200, currency: "USD" });
    // A later place answering is what the list is for, not a problem.
    expect(issues).toEqual([]);
  });

  it("reads one named script when several carry JSON", () => {
    const html = `<h1>Bowl</h1><meta property="og:image" content="/b.jpg">
      <script type="application/json" id="analytics">{"product":{"price":1}}</script>
      <script type="application/json" id="product-json">{"product":{"price":2500}}</script>`;
    const { reading } = readProductPage(
      html,
      url,
      recipe({ title: { select: "h1" }, price: { json: "product.price", script: "#product-json" }, priceUnit: "minor", currency: { constant: "USD" } }),
    );
    expect(reading?.price).toEqual({ amount: 2500, currency: "USD" });
  });

  it("reads an element's text without the script inside it", () => {
    const html = `<div class="price">$19.00<script>window.track("$5.00")</script></div><h1>Bowl</h1><meta property="og:image" content="/b.jpg">`;
    const { reading } = readProductPage(html, url, recipe({ title: { select: "h1" }, price: { select: ".price" }, currency: { constant: "USD" } }));
    expect(reading?.price).toEqual({ amount: 1900, currency: "USD" });
  });

  it("reads stock from the shop's own words only when they're in its lists", () => {
    const html = (said: string) => `<h1>Bowl</h1><span class="price">$19</span><b class="stock">${said}</b><meta property="og:image" content="/b.jpg">`;
    const spec = recipe({
      title: { select: "h1" },
      price: { select: ".price" },
      currency: { constant: "USD" },
      available: { from: { select: ".stock" }, inStock: ["Ready to ship"], outOfStock: ["Sold out"] },
    });
    expect(readProductPage(html("Ready to ship"), url, spec).reading?.available).toBe(true);
    expect(readProductPage(html("Sold out"), url, spec).reading?.available).toBe(false);
    const unsure = readProductPage(html("Ask us"), url, spec);
    expect(unsure.reading?.available).toBeUndefined();
    expect(unsure.issues).toEqual([`available: "Ask us" isn't usable`]);
  });

  it("needs a title, price, currency and photo for a reading, and says which are missing", () => {
    const { reading, issues } = readProductPage(`<h1>Bowl</h1>`, url, recipe({ title: { select: "h1" } }));
    expect(reading).toBeNull();
    expect(issues).toEqual(["price: not found", "currency: not found", "image: not found"]);
  });

  it("keeps recipes to data: no unknown keys, no pages outside the recipe's paths", () => {
    expect(catalogRecipeSchema.safeParse({ format: 2, pathPrefix: "/shop/", code: "process.env" }).success).toBe(false);
    expect(catalogRecipeSchema.safeParse({ format: 2, pathPrefix: "/shop/", title: { json: "a..b" } }).success).toBe(false);
    expect(readWithRecipe("<h1>Hi</h1>", "https://studio.example/about", recipe({})).issues).toEqual(["the page isn't under the recipe's pathPrefix"]);
  });

  it("reads format 1 recipes as format 2", () => {
    const old = {
      format: 1,
      pathPrefix: "/shop/",
      title: { selector: "meta[property='og:title']", attribute: "content" },
      price: { selector: ".price" },
      currency: { constant: "EUR" },
      image: { selector: "meta[property='og:image']", attribute: "content" },
    };
    const upgraded = anyRecipeSchema.parse(old);
    expect(upgraded).toEqual({
      format: 2,
      pathPrefix: "/shop/",
      title: { select: "meta[property='og:title']", attribute: "content" },
      price: { select: ".price" },
      currency: { constant: "EUR" },
      image: { select: "meta[property='og:image']", attribute: "content" },
    });
    const html = `<meta property="og:title" content="Mug"><meta property="og:image" content="/m.jpg"><span class="price">€12,50</span>`;
    expect(readProductPage(html, url, upgraded).reading).toMatchObject({ title: "Mug", price: { amount: 1250, currency: "EUR" } });
  });

  it("gives partial products to callers that can use them, such as Palace's link previews", () => {
    const palace = reviewedRecipeFor("https://usa.palaceskateboards.com/products/z2p9r5lpfqwv");
    expect(palace).toBeDefined();
    expect(reviewedRecipeFor("https://usa.palaceskateboards.com/pages/about")).toBeUndefined();
    const html = `<h1 id="product-title">SHEEPSKIN FLYING JACKET BROWN</h1><span id="product-price">$1,898</span>`;
    const { fields } = readFields(html, "https://usa.palaceskateboards.com/products/z2p9r5lpfqwv", palace!);
    expect(fields).toMatchObject({ title: "SHEEPSKIN FLYING JACKET BROWN", price: 189800, currency: "USD", image: undefined });
  });
});
