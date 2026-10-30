import { describe, expect, it } from "vitest";
import { catalogRecipeSchema, parsePrice, readFields, readProductPage, shopifyReading } from "../src/index.js";
const url = "https://example.com/products/tee";
const ld = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
const product = (offers: unknown) => ({ "@type": "Product", name: "Tee", image: ["/one.jpg", "/two.jpg", "javascript:alert(1)"], offers });

describe("source-backed extraction repairs", () => {
  it.each([["10.9500", "USD", 1095], ["1234.0000", "JPY", 1234], ["1.2340", "KWD", 1234], ["0.00", "USD", 0]])("reads machine decimals %s %s", (price, currency, expected) => {
    expect(parsePrice(String(price), String(currency), "decimal")).toBe(expected);
    expect(readFields(ld(product({ price, priceCurrency: currency })), url).fields.price).toBe(expected);
  });
  it("keeps grouping separate from machine decimals and refuses multi-price text", () => {
    expect(parsePrice("€1.234,50", "EUR")).toBe(123450);
    expect(parsePrice("$1,898", "USD")).toBe(189800);
    for (const raw of ["$20/month", "was $80 now $20", "$20 - $80", "-$20"]) expect(parsePrice(raw, "USD")).toBeUndefined();
  });
  it("reads meta tag prices as a page shows them, not only as machine decimals", () => {
    const tags = (amount: string) => `<meta property="product:price:amount" content="${amount}"><meta property="product:price:currency" content="SEK">`;
    expect(readFields(tags("1.250,00"), url).fields.price).toBe(125000);
    expect(readFields(tags("10.9500"), url).fields.price).toBe(1095);
  });
  it("preserves galleries and never invents stock for an unrecognized availability", () => {
    const { reading } = readProductPage(ld(product({ price: "10.9500", priceCurrency: "USD", availability: "https://schema.org/Unknown" })), url);
    expect(reading?.images).toEqual([{ url: "https://example.com/one.jpg" }, { url: "https://example.com/two.jpg" }]);
    expect(reading?.available).toBeUndefined();
  });
  it("scopes microdata to the product, not a nested unrelated recommendation", () => {
    const html = `<div itemscope itemtype="https://schema.org/Product"><span itemprop="name">Tee</span><span itemprop="sku">TEE</span>
      <div itemprop="brand" itemscope itemtype="https://schema.org/Brand"><meta itemprop="name" content="Maker"></div>
      <div itemprop="offers" itemscope itemtype="https://schema.org/Offer"><meta itemprop="price" content="12.5000"><meta itemprop="priceCurrency" content="EUR"><link itemprop="availability" href="https://schema.org/OutOfStock"></div>
      <div itemscope itemtype="https://schema.org/Product"><span itemprop="name">Unrelated</span><meta itemprop="price" content="1"></div></div>`;
    expect(readFields(html, url).fields).toMatchObject({ title: "Tee", sku: "TEE", maker: "Maker", price: 1250, currency: "EUR", available: false });
  });
  it("reads variant offers with per-size price and unknown stock without cross-currency comparisons", () => {
    const variants = [
      { "@type": "Offer", sku: "S", price: "12.5000", priceCurrency: "EUR", availability: "https://schema.org/InStock", itemOffered: { "@type": "Product", size: "Small" } },
      { "@type": "Offer", sku: "M", price: "1.00", priceCurrency: "USD", itemOffered: { "@type": "Product", size: "Medium" } },
    ];
    const fields = readFields(ld(product(variants)), url).fields;
    expect(fields.price).toBe(1250);
    expect(fields.currency).toBe("EUR");
    expect(fields.variants[1]).toMatchObject({ title: "Medium", price: { amount: 100, currency: "USD" } });
    expect(fields.variants[1]?.available).toBeUndefined();
  });
  it("reads bounded JSON variant recipes including string minor units and keeps failed fallbacks", () => {
    const html = `<script type="application/json">${JSON.stringify({ variants: [{ label: "Small", price: "1250", stock: false }, { label: "Medium", price: "1400" }] })}</script>`;
    const recipe = catalogRecipeSchema.parse({ format: 2, pathPrefix: "/products/", currency: { constant: "USD" }, variants: {
      from: { json: "variants" }, title: { json: "item.label" }, price: { json: "item.price" }, priceUnit: "minor", available: { from: { json: "item.stock" } },
    } });
    const fields = readFields(html, url, recipe).fields;
    expect(fields.variants[0]).toMatchObject({ title: "Small", price: { amount: 1250, currency: "USD" }, available: false });
    expect(fields.variants[1]?.available).toBeUndefined();
    const broken = { ...recipe, variants: { ...recipe.variants!, from: { json: "missing" } } };
    const group = ld({ "@type": "ProductGroup", hasVariant: [{ "@type": "Product", name: "Large", offers: { price: "12", priceCurrency: "USD" } }] });
    expect(readFields(group, url, broken).fields.variants[0]?.title).toBe("Large");
  });
  it("keeps unknown Shopify stock unknown", () => {
    const reading = shopifyReading({ id: 1, title: "Tee", handle: "tee", variants: [{ title: "S", available: false }, { title: "M" }] }, new URL(url), "USD");
    expect(reading.available).toBeUndefined();
  });
});
