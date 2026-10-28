import { schema } from "@skeleton/hub-db";
import { and, eq, isNull } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { parsePrice } from "@skeleton/engine";
import { hubApi, issueToken } from "../src/api.js";
import { crawlSource, type CrawlOptions } from "../src/engine/crawl.js";
import { decideProposal, flagsFor, pendingProposals, proposeSite } from "../src/proposals.js";
import { setRole } from "../src/roles.js";
import { useHubDb } from "./helpers/db.js";
import { html, startFixtureServer, type Route } from "./helpers/fixture-server.js";

const db = useHubDb();
const { listing, proposal, recipe, source } = schema;

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

const why = "A ceramics studio in Lisbon that throws and glazes everything itself.";

const page = (title: string, price: string) =>
  html(`<html><head><meta property="og:title" content="${title}"><meta property="og:image" content="/img/${encodeURIComponent(title)}.jpg"></head>
  <body><h1>${title}</h1><span class="price">${price}</span><p class="maker">Studio Kiln</p></body></html>`);

/** A shop on no platform we know: a sitemap index, a product sitemap, and plain product pages. */
async function kiln() {
  const xml = (body: string): Route => (_req, res) => res.writeHead(200, { "content-type": "application/xml" }).end(body);
  const pages = ["bowl", "mug", "vase", "plate", "jug", "cup"];
  const server: Awaited<ReturnType<typeof startFixtureServer>> = await startFixtureServer({
    "/robots.txt": (_req, res) => res.writeHead(404).end(),
    "/sitemap.xml": (req, res) =>
      xml(`<sitemapindex><sitemap><loc>${server.url("/sitemap-pages.xml")}</loc></sitemap><sitemap><loc>${server.url("/sitemap-products.xml")}</loc></sitemap></sitemapindex>`)(req, res),
    "/sitemap-pages.xml": (req, res) => xml(`<urlset><url><loc>${server.url("/about")}</loc></url></urlset>`)(req, res),
    "/sitemap-products.xml": (req, res) => xml(`<urlset>${pages.map((p) => `<url><loc>${server.url(`/shop/${p}`)}</loc></url>`).join("")}</urlset>`)(req, res),
    ...Object.fromEntries(pages.map((p, i) => [`/shop/${p}`, page(`Stoneware ${p}`, `€${40 + i},50`)])),
  });
  closers.push(server.close);
  const crawl: CrawlOptions = { pauseMs: 0, fetch: { allowPrivate: true }, originOf: () => new URL(server.url("/")) };
  return crawl;
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

async function people() {
  const add = async (handle: string, kind: "agent" | "person", role: "contributor" | "owner" = "contributor") =>
    (await db.insert(schema.contributor).values({ handle, kind, role }).returning())[0]!.id;
  return { ana: await add("claude-of-ana", "agent"), ben: await add("ben", "person"), zack: await add("zack", "person", "owner") };
}

describe("proposals", () => {
  it("reads prices the way shops write them", () => {
    expect(parsePrice("€1.234,50", "EUR")).toBe(123450);
    expect(parsePrice("$1,234.50", "USD")).toBe(123450);
    expect(parsePrice("$ 98", "USD")).toBe(9800);
    expect(parsePrice("12 500 ¥", "JPY")).toBe(12500);
    expect(parsePrice("¥12,500", "JPY")).toBe(12500);
    expect(parsePrice("CHF 1'200.00", "CHF")).toBe(120000);
    expect(parsePrice("sold out", "USD")).toBeUndefined();
  });

  it("sends a proposal that doesn't read straight back, with what went wrong, and keeps nothing", async () => {
    const crawl = await kiln();
    const { ana } = await people();
    await expect(proposeSite(db, ana, { url: "kiln.example", note: why }, crawl)).rejects.toMatchObject({
      status: 422,
      message: expect.stringContaining("send it again with a recipe"),
    });
    const broken = await proposeSite(db, ana, { url: "kiln.example", note: why, recipe: { ...good, price: { selector: ".cost" } } }, crawl).catch((e) => e);
    expect(broken).toMatchObject({ status: 422, report: { read: 0, pagesFound: 6 } });
    expect(broken.report.pages[0].issues).toContain("price: expected one element, found 0");
    expect(await db.select().from(proposal)).toEqual([]);
    expect(await db.select().from(source)).toEqual([]);
  });

  it("is one thing to decide: the site, why, how it's read and its samples, approved together", async () => {
    const crawl = await kiln();
    const { ana, ben, zack } = await people();
    const made = await proposeSite(db, ana, { url: "https://kiln.example/about", note: why, recipe: good }, crawl);
    expect(made).toMatchObject({ domain: "kiln.example", reader: "recipe", replaced: false, report: { read: 5 } });
    expect(made.report.pages[0]!.reading).toMatchObject({ title: "Stoneware bowl", maker: "Studio Kiln", price: { amount: 4050, currency: "EUR" } });

    // Sending it again replaces it; someone else's proposal of the same site waits its turn.
    const again = await proposeSite(db, ana, { url: "kiln.example", note: `${why} Everything is made to order.`, recipe: good }, crawl);
    expect(again).toMatchObject({ proposalId: made.proposalId, replaced: true });
    await expect(proposeSite(db, ben, { url: "kiln.example", note: why, recipe: good }, crawl)).rejects.toMatchObject({ status: 409 });

    const [waiting, ...rest] = await pendingProposals(db);
    expect(rest).toEqual([]);
    expect(waiting).toMatchObject({ domain: "kiln.example", proposer: "claude-of-ana", note: expect.stringContaining("made to order"), reader: "recipe" });

    expect(await decideProposal(db, zack, made.proposalId, true)).toEqual({ id: made.proposalId, status: "approved" });
    expect(await decideProposal(db, zack, made.proposalId, true)).toBeNull();
    const [site] = await db.select().from(source).where(eq(source.domain, "kiln.example"));
    expect(site).toMatchObject({ status: "approved", readerId: "recipe" });
    const recipes = await db.select({ version: recipe.version, status: recipe.status }).from(recipe);
    expect(Object.fromEntries(recipes.map((r) => [r.version, r.status]))).toEqual({ 1: "retired", 2: "live" });

    expect(await crawlSource(db, site!.id, crawl)).toMatchObject({ status: "done", seen: 6, added: 6 });
    expect(await db.select().from(listing).where(and(eq(listing.sourceId, site!.id), isNull(listing.goneAt)))).toHaveLength(6);
    await expect(proposeSite(db, ben, { url: "kiln.example", note: why }, crawl)).rejects.toMatchObject({ status: 409, message: "the hub already reads this site" });
  });

  it("keeps a rejected site declined, and lets curators decide over the API", async () => {
    const crawl = await kiln();
    const { ana } = await people();
    const made = await proposeSite(db, ana, { url: "kiln.example", note: why, recipe: good }, crawl);
    const api = hubApi(db);
    const token = await issueToken(db, "mira", "person");
    const call = (method: string, path: string, body?: unknown) =>
      api.request(path, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    expect((await call("GET", "/api/proposals")).status).toBe(403);
    await setRole(db, "mira", "curator");
    expect(((await (await call("GET", "/api/proposals")).json()) as { id: string }[]).map((p) => p.id)).toEqual([made.proposalId]);
    expect(await (await call("POST", `/api/proposals/${made.proposalId}/decision`, { approve: false })).json()).toEqual({ id: made.proposalId, status: "rejected" });
    expect((await call("POST", "/api/proposals/nope/decision", { approve: true })).status).toBe(404);
    const [site] = await db.select().from(source);
    expect(site!.status).toBe("rejected");
    await expect(proposeSite(db, ana, { url: "kiln.example", note: why, recipe: good }, crawl)).rejects.toMatchObject({ message: "a curator already declined this site" });
  });

  it("serves the curators' page, which builds what contributors wrote as text", async () => {
    const page = await (await hubApi(db).request("/curate")).text();
    expect(page).toContain("<title>Curate</title>");
    expect(page).not.toContain("innerHTML");
  });

  it("lets a proposal go in on its own once its proposer has a track record, and flags what needs a look", async () => {
    const crawl = await kiln();
    const { ana, zack } = await people();
    const first = await proposeSite(db, ana, { url: "kiln.example", note: why, recipe: good }, crawl);
    expect(first).toMatchObject({ status: "pending", flags: ["first proposal from this contributor"] });
    await decideProposal(db, zack, first.proposalId, true);

    // The same shop under another name stands in for a second one: this time it goes straight in.
    const second = await proposeSite(db, ana, { url: "kiln-two.example", note: why, recipe: good }, crawl);
    expect(second).toMatchObject({ status: "approved", flags: [] });
    const [site] = await db.select().from(source).where(eq(source.domain, "kiln-two.example"));
    expect(site).toMatchObject({ status: "approved", readerId: "recipe" });
    const [decided] = await db.select().from(proposal).where(eq(proposal.id, second.proposalId));
    const [hub] = await db.select().from(schema.contributor).where(eq(schema.contributor.handle, "hub"));
    expect(decided).toMatchObject({ status: "approved", decidedById: hub!.id });

    // Products naming no maker need a look, whoever proposes them.
    const anonymous = await proposeSite(db, ana, { url: "kiln-three.example", note: why, recipe: { ...good, maker: undefined } }, crawl);
    expect(anonymous).toMatchObject({ status: "pending", flags: ["its products name no maker"] });
  });

  it("turns marketplaces away: they are thousands of sellers, not one shop", async () => {
    const { ana } = await people();
    for (const url of ["https://www.etsy.com/shop/somekiln", "amazon.co.uk", "https://www.vinted.fr"]) {
      await expect(proposeSite(db, ana, { url, note: why })).rejects.toMatchObject({ status: 422, message: expect.stringContaining("marketplace") });
    }
  });

  it("flags a shop whose samples come from many makers", async () => {
    const { zack } = await people();
    const page = (maker: string) => ({ url: `https://shop.example/p/${maker}`, issues: [], reading: { externalId: maker, url: `https://shop.example/p/${maker}`, title: "Tee", maker } });
    const report = { pagesFound: 4, read: 4, pages: ["Acne", "Arket", "Toteme", "Acne"].map(page) };
    expect(await flagsFor(db, zack, report)).toEqual(["first proposal from this contributor", "sells many brands (3 among 4 samples): a reseller or a multi-brand shop"]);
  });
});
