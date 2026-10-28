import { readingSchema } from "@skeleton/formats";
import { schema } from "@skeleton/hub-db";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { crawlSource, type CrawlOptions } from "../src/engine/crawl.js";
import { decideProposal, proposeSite } from "../src/proposals.js";
import { readStructured } from "../src/readers/standard.js";
import { shopifyProductSchema, shopifyReading } from "../src/readers/shopify.js";
import { useHubDb } from "./helpers/db.js";
import { html, startFixtureServer, type Route } from "./helpers/fixture-server.js";

const db = useHubDb();
const { source } = schema;

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

const page = (data: unknown, head = "") => `<html><head>${head}<script type="application/ld+json">${JSON.stringify(data)}</script></head><body></body></html>`;

describe("reading any shop from its structured data", () => {
  it("reads a schema.org Product with its offer, brand and identifiers", () => {
    const reading = readStructured(
      page({
        "@context": "https://schema.org",
        "@type": "Product",
        name: "Waxed field jacket",
        description: "Waxed cotton, made in England.",
        image: ["https://cdn.example/jacket.jpg"],
        brand: { "@type": "Brand", name: "Hartley" },
        sku: "HJ-01",
        mpn: "FJ2024",
        gtin13: "5012345678900",
        offers: { "@type": "Offer", price: "349.00", priceCurrency: "GBP", availability: "https://schema.org/InStock" },
      }),
      "https://hartley.example/jackets/field-jacket?colour=olive",
    );
    expect(reading).toMatchObject({
      externalId: "/jackets/field-jacket",
      url: "https://hartley.example/jackets/field-jacket",
      title: "Waxed field jacket",
      maker: "Hartley",
      price: { amount: 34900, currency: "GBP" },
      available: true,
      images: [{ url: "https://cdn.example/jacket.jpg" }],
      identifiers: { gtin: "5012345678900", mpn: "FJ2024", sku: "HJ-01" },
    });
    expect(readingSchema.safeParse(reading).success).toBe(true);
  });

  it("reads a product group's variants, the cheapest price and each variant's barcode, out of @graph", () => {
    const reading = readStructured(
      page({
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "Organization", name: "Uniform Store" },
          {
            "@type": "ProductGroup",
            name: "Merino crew",
            brand: "Uniform",
            image: { "@type": "ImageObject", url: "/img/crew.jpg" },
            hasVariant: [
              { "@type": "Product", name: "Merino crew, M", sku: "MC-M", gtin12: "012345678905", offers: { "@type": "Offer", price: 79, priceCurrency: "USD", availability: "OutOfStock" } },
              { "@type": "Product", name: "Merino crew, L", sku: "MC-L", offers: { "@type": "Offer", price: 69, priceCurrency: "USD", availability: "InStock" } },
            ],
          },
        ],
      }),
      "https://uniform.example/p/merino-crew",
    );
    expect(reading).toMatchObject({
      title: "Merino crew",
      maker: "Uniform",
      price: { amount: 6900, currency: "USD" },
      available: true,
      images: [{ url: "https://uniform.example/img/crew.jpg" }],
      variants: [
        { title: "Merino crew, M", sku: "MC-M", gtin: "012345678905", available: false, price: { amount: 7900, currency: "USD" } },
        { title: "Merino crew, L", sku: "MC-L", available: true },
      ],
    });
  });

  it("falls back to Open Graph and product meta tags, and turns down pages that aren't products", () => {
    const meta = `<meta property="og:title" content="Linen apron"><meta property="og:image" content="https://cdn.example/apron.jpg">
      <meta property="product:price:amount" content="1.250,00"><meta property="product:price:currency" content="SEK">`;
    expect(readStructured(`<html><head>${meta}</head></html>`, "https://atelje.example/products/apron")).toMatchObject({
      title: "Linen apron",
      price: { amount: 125000, currency: "SEK" },
    });
    expect(readStructured(page({ "@type": "Organization", name: "Atelje" }), "https://atelje.example/about")).toBeNull();
    expect(readStructured(page({ "@type": "Product", name: "No price" }), "https://atelje.example/p/x")).toBeNull();
    expect(readStructured(`<script type="application/ld+json">{ broken</script>`, "https://atelje.example/p/x")).toBeNull();
  });

  it("keeps a Shopify variant's barcode only when it is one", () => {
    const product = shopifyProductSchema.parse({
      id: 1,
      title: "Crew",
      handle: "crew",
      variants: [
        { id: 10, title: "M", price: "10.00", barcode: "5012345678900" },
        { id: 11, title: "L", price: "10.00", barcode: "n/a" },
      ],
    });
    const reading = shopifyReading(product, new URL("https://shop.example"), "EUR");
    expect(reading.variants!.map((v) => v.gtin)).toEqual(["5012345678900", undefined]);
  });

  it("takes a proposal of a shop on no platform it knows, and crawls it, from its structured data alone", async () => {
    const xml = (body: string): Route => (_req, res) => res.writeHead(200, { "content-type": "application/xml" }).end(body);
    const items = ["bowl", "mug", "vase", "plate", "jug"];
    const product = (slug: string, i: number) =>
      html(page({ "@type": "Product", name: `Stoneware ${slug}`, image: `/img/${slug}.jpg`, offers: { price: 40 + i, priceCurrency: "EUR", availability: "InStock" } }));
    const server: Awaited<ReturnType<typeof startFixtureServer>> = await startFixtureServer({
      "/robots.txt": (_req, res) => res.writeHead(200, { "content-type": "text/plain" }).end(`User-agent: *\nSitemap: ${server.url("/wp-sitemap.xml")}`),
      "/wp-sitemap.xml": (req, res) =>
        xml(`<sitemapindex><sitemap><loc>${server.url("/wp-sitemap-posts-page-1.xml")}</loc></sitemap><sitemap><loc>${server.url("/wp-sitemap-posts-product-1.xml")}</loc></sitemap></sitemapindex>`)(req, res),
      "/wp-sitemap-posts-page-1.xml": (req, res) => xml(`<urlset><url><loc>${server.url("/about")}</loc></url></urlset>`)(req, res),
      "/wp-sitemap-posts-product-1.xml": (req, res) => xml(`<urlset>${items.map((p) => `<url><loc>${server.url(`/product/${p}`)}</loc></url>`).join("")}</urlset>`)(req, res),
      ...Object.fromEntries(items.map((p, i) => [`/product/${p}`, product(p, i)])),
    });
    closers.push(server.close);
    const crawl: CrawlOptions = { pauseMs: 0, fetch: { allowPrivate: true }, originOf: () => new URL(server.url("/")) };
    const [ana] = await db.insert(schema.contributor).values({ handle: "claude-of-ana", kind: "agent" }).returning();
    const [zack] = await db.insert(schema.contributor).values({ handle: "zack", kind: "person", role: "owner" }).returning();

    const made = await proposeSite(db, ana!.id, { url: "kiln.example", note: "A two-person ceramics studio selling only from its own shop." }, crawl);
    expect(made).toMatchObject({ reader: "standard", report: { read: 5 } });
    await decideProposal(db, zack!.id, made.proposalId, true);
    const [site] = await db.select().from(source).where(eq(source.domain, "kiln.example"));
    expect(site).toMatchObject({ status: "approved", readerId: "standard" });
    expect(await crawlSource(db, site!.id, crawl)).toMatchObject({ status: "done", seen: 5, added: 5 });
  });
});
