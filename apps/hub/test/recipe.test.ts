import { schema } from "@skeleton/hub-db";
import { and, eq, isNull } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { hubApi, issueToken } from "../src/api.js";
import { crawlSource, type CrawlOptions } from "../src/engine/crawl.js";
import { parsePrice } from "../src/readers/recipe.js";
import { submitRecipe } from "../src/recipes.js";
import { setRole } from "../src/roles.js";
import { useHubDb } from "./helpers/db.js";
import { html, startFixtureServer, type Route } from "./helpers/fixture-server.js";

const db = useHubDb();
const { listing, recipe, source } = schema;

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

const page = (title: string, price: string) =>
  html(`<html><head><meta property="og:title" content="${title}"><meta property="og:image" content="/img/${encodeURIComponent(title)}.jpg"></head>
  <body><h1>${title}</h1><span class="price">${price}</span><p class="maker">Studio Kiln</p><button class="buy">Add to cart</button></body></html>`);

/** A shop on no platform we know: a sitemap index, a product sitemap, and plain product pages. */
async function shop() {
  const xml = (body: string): Route => (_req, res) => res.writeHead(200, { "content-type": "application/xml" }).end(body);
  const pages = ["bowl", "mug", "vase", "plate", "jug", "cup"];
  const server: Awaited<ReturnType<typeof startFixtureServer>> = await startFixtureServer({
    "/robots.txt": (_req, res) => res.writeHead(404).end(),
    "/sitemap.xml": (req, res) => xml(`<sitemapindex><sitemap><loc>${server.url("/sitemap-pages.xml")}</loc></sitemap><sitemap><loc>${server.url("/sitemap-products.xml")}</loc></sitemap></sitemapindex>`)(req, res),
    "/sitemap-pages.xml": (req, res) => xml(`<urlset><url><loc>${server.url("/about")}</loc></url></urlset>`)(req, res),
    "/sitemap-products.xml": (req, res) => xml(`<urlset>${pages.map((p) => `<url><loc>${server.url(`/shop/${p}`)}</loc></url>`).join("")}</urlset>`)(req, res),
    ...Object.fromEntries(pages.map((p, i) => [`/shop/${p}`, page(`Stoneware ${p}`, `€${40 + i},50`)])),
  });
  closers.push(server.close);
  const crawl: CrawlOptions = { pauseMs: 0, fetch: { allowPrivate: true }, originOf: () => new URL(server.url("/")) };
  const [site] = await db.insert(source).values({ domain: "kiln.example" }).returning({ id: source.id });
  return { site: site!.id, crawl };
}

const good = {
  format: 1,
  pathPrefix: "/shop/",
  title: { selector: "meta[property='og:title']", attribute: "content" },
  price: { selector: ".price" },
  currency: { constant: "EUR" },
  image: { selector: "meta[property='og:image']", attribute: "content" },
  maker: { selector: ".maker" },
};

describe("recipes", () => {
  it("reads prices the way shops write them", () => {
    expect(parsePrice("€1.234,50", "EUR")).toBe(123450);
    expect(parsePrice("$1,234.50", "USD")).toBe(123450);
    expect(parsePrice("$ 98", "USD")).toBe(9800);
    expect(parsePrice("12 500 ¥", "JPY")).toBe(12500);
    expect(parsePrice("¥12,500", "JPY")).toBe(12500);
    expect(parsePrice("CHF 1'200.00", "CHF")).toBe(120000);
    expect(parsePrice("sold out", "USD")).toBeUndefined();
  });

  it("tries a contributor's recipe on real pages, and a curator's approval puts the site in the crawl", async () => {
    const { site, crawl } = await shop();
    const author = (await db.insert(schema.contributor).values({ handle: "claude-of-ana", kind: "agent" }).returning())[0]!.id;

    // A recipe with a selector that matches nothing is kept, with what went wrong, but no curator sees it.
    const broken = await submitRecipe(db, author, "kiln.example", { ...good, price: { selector: ".cost" } }, crawl);
    expect(broken.report).toMatchObject({ pagesFound: 6, read: 0, ready: false });
    expect(broken.report.pages[0]!.issues).toContain("price: expected one element, found 0");

    const fixed = await submitRecipe(db, author, "kiln.example", good, crawl);
    expect(fixed).toMatchObject({ version: 2, report: { read: 5, ready: true } });
    expect(fixed.report.pages[0]!.reading).toMatchObject({ title: "Stoneware bowl", maker: "Studio Kiln", price: { amount: 4050, currency: "EUR" } });

    const api = hubApi(db);
    const token = await issueToken(db, "zack", "person");
    await setRole(db, "zack", "owner");
    const call = (method: string, path: string, body?: unknown) =>
      api.request(path, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const pending = (await (await call("GET", "/api/recipes/pending")).json()) as { id: string; domain: string }[];
    expect(pending.map((p) => p.id)).toEqual([fixed.recipeId]);
    expect((await call("POST", `/api/recipes/${broken.recipeId}/decision`, { approve: true })).status).toBe(404);
    expect(await (await call("POST", `/api/recipes/${fixed.recipeId}/decision`, { approve: true })).json()).toEqual({ id: fixed.recipeId, status: "live" });

    const [approved] = await db.select().from(source).where(eq(source.id, site));
    expect(approved).toMatchObject({ status: "approved", readerId: "recipe" });
    expect(await crawlSource(db, site, crawl)).toMatchObject({ status: "done", seen: 6, added: 6 });
    const listings = await db.select().from(listing).where(and(eq(listing.sourceId, site), isNull(listing.goneAt)));
    expect(listings.map((l) => l.externalId).sort()).toContain("/shop/bowl");

    // A newer recipe retires the live one when it's approved.
    const third = await submitRecipe(db, author, "kiln.example", good, crawl);
    await call("POST", `/api/recipes/${third.recipeId}/decision`, { approve: true });
    const statuses = await db.select({ version: recipe.version, status: recipe.status }).from(recipe).where(eq(recipe.sourceId, site));
    expect(Object.fromEntries(statuses.map((s) => [s.version, s.status]))).toEqual({ 1: "draft", 2: "retired", 3: "live" });
  });

  it("won't take a recipe for a site a platform reader already reads, or one the hub doesn't know", async () => {
    await db.insert(source).values({ domain: "shop.example", readerId: "shopify" });
    const author = (await db.insert(schema.contributor).values({ handle: "a", kind: "agent" }).returning())[0]!.id;
    await expect(submitRecipe(db, author, "shop.example", good)).rejects.toMatchObject({ status: 409 });
    await expect(submitRecipe(db, author, "unknown.example", good)).rejects.toMatchObject({ status: 404 });
    await expect(submitRecipe(db, author, "shop.example", { ...good, format: 9 })).rejects.toMatchObject({ status: 422 });
  });
});
