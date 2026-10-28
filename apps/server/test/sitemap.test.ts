import zlib from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { sitemapConnector } from "../src/catalog/connectors/index.js";
import { discoverProducts, looksLikeProduct, parseRobots, parseSitemap, robotsAllows } from "@skeleton/engine";
import { parseProductPage } from "../src/closet/link-preview.js";
import { bytes, html, json, redirect, type Route, startFixtureServer } from "./helpers/fixture-server.js";

const options = { allowPrivate: true };
const xml = (body: string): Route => (_req, res) => { res.writeHead(200, { "content-type": "application/xml" }).end(body); };
const text = (body: string): Route => (_req, res) => { res.writeHead(200, { "content-type": "text/plain" }).end(body); };
const urlset = (...locs: string[]) => `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${
  locs.map((loc) => `<url><loc>${loc}</loc><lastmod>2026-10-20</lastmod></url>`).join("")}</urlset>`;
const index = (...locs: string[]) => `<?xml version="1.0"?><sitemapindex>${locs.map((loc) => `<sitemap><loc>${loc}</loc></sitemap>`).join("")}</sitemapindex>`;

const microdata = `<div itemscope itemtype="https://schema.org/Product">
  <div itemprop="brand" itemscope itemtype="https://schema.org/Brand"><span itemprop="name">Small Label</span></div>
  <h1 itemprop="name">Wool Overshirt</h1>
  <img itemprop="image" src="/overshirt.jpg">
  <meta itemprop="mpn" content="OS-1">
  <div itemprop="offers" itemscope itemtype="https://schema.org/Offer">
    <span itemprop="price" content="185.00">$185</span><meta itemprop="priceCurrency" content="USD">
  </div>
</div>`;

let servers: Awaited<ReturnType<typeof startFixtureServer>>[] = [];
afterEach(async () => { await Promise.all(servers.map((s) => s.close())); servers = []; });

/** One store per server, since robots.txt and the feed live at the root. Records every path requested. */
async function store(routes: (url: (path: string) => string) => Record<string, Route>) {
  const requested: string[] = [];
  const table: Record<string, Route> = {};
  const server = await startFixtureServer(new Proxy(table, {
    get: (target, path: string) => { requested.push(path); return target[path]; },
  }));
  servers.push(server);
  Object.assign(table, routes(server.url));
  return { url: server.url, requested };
}

describe("robots.txt", () => {
  const robots = parseRobots(`
    User-agent: *
    Disallow: /checkout
    Disallow: /*?variant=
    Allow: /checkout/public$
    Sitemap: https://shop.example/sitemap.xml

    User-agent: OtherBot
    Disallow: /
  `);

  it("collects sitemaps and the rules for every crawler", () => {
    expect(robots.sitemaps).toEqual(["https://shop.example/sitemap.xml"]);
    expect(robotsAllows(robots, "https://shop.example/products/a")).toBe(true);
    expect(robotsAllows(robots, "https://shop.example/checkout/1")).toBe(false);
    expect(robotsAllows(robots, "https://shop.example/products/a?variant=2")).toBe(false);
    expect(robotsAllows(robots, "https://shop.example/checkout/public")).toBe(true);
  });

  it("uses our own group over the wildcard", () => {
    const own = parseRobots("User-agent: *\nDisallow:\n\nUser-agent: SkeletonBot\nDisallow: /");
    expect(robotsAllows(own, "https://shop.example/products/a")).toBe(false);
  });
});

describe("sitemaps", () => {
  it("parses url sets and indexes, decoding entities", () => {
    expect(parseSitemap(urlset("https://a.example/p/1?x=1&amp;y=2")).urls)
      .toEqual([{ url: "https://a.example/p/1?x=1&y=2", lastmod: "2026-10-20" }]);
    expect(parseSitemap(index("https://a.example/s1.xml")).sitemaps).toEqual(["https://a.example/s1.xml"]);
    expect(parseSitemap("<urlset><url><loc><![CDATA[https://a.example/p/2]]></loc><image:image><image:loc>https://a.example/i.jpg</image:loc></image:image></url></urlset>").urls)
      .toEqual([{ url: "https://a.example/p/2", lastmod: null }]);
  });

  it("separates product pages from collections and content", () => {
    expect(looksLikeProduct("https://a.example/products/jacket", false)).toBe(true);
    expect(looksLikeProduct("https://a.example/item/123456", false)).toBe(true);
    expect(looksLikeProduct("https://a.example/collections/sale", true)).toBe(false);
    expect(looksLikeProduct("https://a.example/lighting/cat/ceiling-fans-c1851606.html", false)).toBe(false);
    expect(looksLikeProduct("https://a.example/about", false)).toBe(false);
    expect(looksLikeProduct("https://a.example/wool-overshirt", true)).toBe(true);
  });
});

describe("sitemap discovery", () => {
  it("follows robots.txt to a gzipped product sitemap, skipping disallowed paths", async () => {
    const s = await store((url) => ({
      "/": html('<title>Independent shop</title>'),
      "/robots.txt": text(`User-agent: *\nDisallow: /hidden\nSitemap: ${url("/sitemap_index.xml")}`),
      "/sitemap_index.xml": xml(index(url("/pages-sitemap.xml"), url("/product-sitemap.xml.gz"))),
      "/pages-sitemap.xml": xml(urlset(url("/about"), url("/blog/drop"))),
      "/product-sitemap.xml.gz": bytes(zlib.gzipSync(urlset(url("/wool-overshirt"), url("/hidden/sample"), url("/collections/new"))), "application/gzip"),
      "/wool-overshirt": html(microdata),
    }));
    const found = await sitemapConnector.discover(s.url("/"), options);
    expect(found).toMatchObject({ via: "sitemap", complete: false, productUrls: [s.url("/wool-overshirt")] });
    // The product sitemap is read before the pages one.
    expect(s.requested.indexOf("/product-sitemap.xml.gz")).toBeLessThan(s.requested.indexOf("/pages-sitemap.xml"));

    const read = await sitemapConnector.readProduct(found.productUrls[0]!, options);
    expect(read.product).toMatchObject({ title: "Wool Overshirt", brand: "Small Label", priceCents: 18500, currency: "USD", mpn: "OS-1" });
  });

  it("falls back to /sitemap.xml, then to front-page links", async () => {
    const withSitemap = await store((url) => ({
      "/": html("<title>Shop</title>"),
      "/sitemap.xml": xml(urlset(url("/p/lamp"), url("/about"))),
    }));
    expect(await discoverProducts(withSitemap.url("/"), options)).toMatchObject({ via: "sitemap", productUrls: [withSitemap.url("/p/lamp")] });

    const linksOnly = await store(() => ({ "/": html('<a href="/products/mug">Mug</a><a href="/collections/all">All</a>') }));
    expect(await discoverProducts(linksOnly.url("/"), options)).toMatchObject({ via: "links", productUrls: [linksOnly.url("/products/mug")] });
  });

  it("uses the Shopify feed as a fast path when the store has one", async () => {
    const s = await store((url) => ({
      "/": html('<script src="https://cdn.shopify.com/s/files/app.js"></script>'),
      "/products.json": json({ products: [{ handle: "tee" }, { handle: "bad handle!" }] }),
      "/sitemap.xml": xml(urlset(url("/products/other"))),
    }));
    expect(await discoverProducts(s.url("/"), options)).toMatchObject({ via: "shopify-feed", productUrls: [s.url("/products/tee")] });
    expect(s.requested).not.toContain("/sitemap.xml");
  });

  it("stops at a password page without requesting anything behind it", async () => {
    const s = await store(() => ({
      "/": redirect("/password"),
      "/password": html('<form action="/password"><input type="password"></form>'),
      "/sitemap.xml": xml(urlset("/products/secret")),
    }));
    const found = await discoverProducts(s.url("/"), options);
    expect(found).toMatchObject({ via: null, productUrls: [], observation: { state: "locked" } });
    expect(s.requested).not.toContain("/robots.txt");
    expect(s.requested).not.toContain("/sitemap.xml");
  });

  it("stops when a sitemap or feed turns out to be gated or rate limited", async () => {
    const gated = await store(() => ({
      "/": html('<script>Shopify.shop = "x";</script>'),
      "/products.json": redirect("/password"),
      "/password": html('<form action="/password"><input type="password"></form>'),
    }));
    expect((await discoverProducts(gated.url("/"), options)).observation.state).toBe("locked");
    expect(gated.requested).not.toContain("/sitemap.xml");

    const limited = await store((url) => ({
      "/": html("<title>Shop</title>"),
      "/robots.txt": text(`Sitemap: ${url("/a.xml")}\nSitemap: ${url("/b.xml")}`),
      "/a.xml": (_req, res) => res.writeHead(429).end("Slow down"),
      "/b.xml": xml(urlset(url("/p/1"))),
    }));
    expect(await discoverProducts(limited.url("/"), options)).toMatchObject({ productUrls: [], observation: { state: "restricted" } });
    expect(limited.requested).not.toContain("/b.xml");
  });

  it("reads nothing when robots.txt disallows the whole site", async () => {
    const s = await store((url) => ({
      "/": html('<a href="/products/mug">Mug</a>'),
      "/robots.txt": text(`User-agent: *\nDisallow: /\nSitemap: ${url("/sitemap.xml")}`),
      "/sitemap.xml": xml(urlset(url("/products/mug"))),
    }));
    expect((await discoverProducts(s.url("/"), options)).productUrls).toEqual([]);
    expect(s.requested).not.toContain("/sitemap.xml");
  });

  it("puts recently changed pages first", async () => {
    const s = await store((url) => ({
      "/": html("<title>Shop</title>"),
      "/sitemap.xml": xml(`<urlset><url><loc>${url("/p/old")}</loc><lastmod>2019-01-01</lastmod></url><url><loc>${url("/p/undated")}</loc></url>`
        + `<url><loc>${url("/p/new")}</loc><lastmod>2026-10-25T10:00:00Z</lastmod></url></urlset>`),
    }));
    expect((await discoverProducts(s.url("/"), options)).productUrls).toEqual([s.url("/p/new"), s.url("/p/old"), s.url("/p/undated")]);
  });

  it("scopes a locale entry to that storefront and its sitemaps", async () => {
    const s = await store((url) => ({
      "/us/en/": html("<title>Shop</title>"),
      "/robots.txt": text(`Sitemap: ${url("/sitemaps/index.xml")}`),
      "/sitemaps/index.xml": xml(index(url("/sitemaps/cat-en-US_1.xml"), url("/sitemaps/prod-fr-FR_1.xml"), url("/sitemaps/prod-en-US_1.xml"))),
      "/sitemaps/prod-en-US_1.xml": xml(urlset(url("/us/en/p/stool-1234"), url("/fr/fr/p/tabouret-1234"))),
      "/sitemaps/prod-fr-FR_1.xml": xml(urlset(url("/fr/fr/p/chaise-1"))),
    }));
    const found = await discoverProducts(s.url("/us/en/"), options, { maxSitemaps: 3 });
    expect(found.productUrls).toEqual([s.url("/us/en/p/stool-1234")]);
    expect(s.requested.indexOf("/sitemaps/prod-en-US_1.xml")).toBeLessThan(s.requested.indexOf("/sitemaps/prod-fr-FR_1.xml"));
  });

  it("ignores sitemap entries on other hosts and respects the URL budget", async () => {
    const s = await store((url) => ({
      "/": html("<title>Shop</title>"),
      "/sitemap.xml": xml(urlset("https://elsewhere.example/p/1", ...Array.from({ length: 20 }, (_, i) => url(`/p/${i}`)))),
    }));
    const found = await discoverProducts(s.url("/"), options, { maxUrls: 5 });
    expect(found.productUrls).toHaveLength(5);
    expect(found.productUrls.every((u) => u.startsWith(s.url("/")))).toBe(true);
  });

  it("keeps private network protection enabled by default", async () => {
    const s = await store(() => ({ "/": html("<title>Shop</title>") }));
    expect((await sitemapConnector.discover(s.url("/"))).observation.state).toBe("unavailable");
  });
});

describe("schema.org microdata", () => {
  it("reads a product's own properties, not its brand's or offer's", () => {
    expect(parseProductPage(microdata, "https://shop.example/wool-overshirt")).toMatchObject({
      title: "Wool Overshirt", brand: "Small Label", priceCents: 18500, currency: "USD",
      images: ["https://shop.example/overshirt.jpg"], mpn: "OS-1",
    });
  });

  it("lets JSON-LD win where both are present", () => {
    const ld = `<script type="application/ld+json">${JSON.stringify({ "@type": "Product", name: "LD Name", offers: { price: "10", priceCurrency: "EUR" } })}</script>`;
    expect(parseProductPage(ld + microdata, "https://shop.example/x")).toMatchObject({ title: "LD Name", priceCents: 1000, currency: "EUR", brand: "Small Label" });
  });
});
