import type { AlertsResponse, SavedSearchSummary, SearchResponse, WatchSummary } from "@skeleton/shared";
import { keywordIntent } from "@skeleton/shared";
import { beforeEach, describe, expect, it } from "vitest";
import type { RawOffer, Source } from "../src/search/sources/index.js";
import { signUp, useTestApp } from "./helpers/setup.js";

const { setup, setupWithServices } = useTestApp();

/** A store whose listings the test changes between scheduled runs. */
let listings: RawOffer[] = [];
const listing = (slug: string, title: string, priceCents: number): RawOffer => ({
  source: "stub",
  store: { name: "Stub Shoes", domain: "stub.example" },
  url: `https://stub.example/products/${slug}`,
  title,
  brand: "Allbirds",
  priceCents,
  currency: "USD",
  condition: "new",
  imageUrl: `https://stub.example/img/${slug}.jpg`,
  gtin: null,
  mpn: null,
  inStock: true,
});
const stub: Source = {
  id: "stub",
  label: "Stub",
  search: async (query) => {
    const words = query.text.toLowerCase().split(/\s+/);
    return listings.filter((l) => words.every((w) => `${l.brand} ${l.title}`.toLowerCase().includes(w)));
  },
};
const sources = { sources: [stub], info: [{ id: "stub", label: "Stub", enabled: true, needs: null }] };

function start() {
  const { app, services } = setupWithServices({}, { sources });
  return { app, alerts: services.alerts };
}

async function firstProductId(user: Awaited<ReturnType<typeof signUp>>, q: string) {
  const response = await user.get(`/api/search?q=${encodeURIComponent(q)}`);
  const body = (await response.json()) as SearchResponse;
  return body.results[0]!.productId;
}

beforeEach(() => {
  listings = [listing("tree-runner-navy", "Tree Runner Navy", 10000), listing("wool-runner-grey", "Wool Runner Grey", 11000)];
});

describe("alerts", () => {
  it("saves interpreted constraints and deduplicates the equivalent explicit search", async () => {
    const { app } = start();
    const user = await signUp(app);
    const intent = keywordIntent("tree runner");
    intent.condition = { values: ["new"], strength: "required", evidence: "new" };
    intent.budget = { amountCents: 20000, currency: "USD", comparison: "lte", strength: "required", evidence: "up to $200" };
    const first = await (await user.post("/api/saved-searches", { q: "new tree runner up to $200", intent })).json() as SavedSearchSummary;
    expect(first).toMatchObject({ query: "new tree runner up to $200", intent });
    const second = await (await user.post("/api/saved-searches", { q: "tree runner", condition: "new", max: 200 })).json() as SavedSearchSummary;
    expect(second.id).toBe(first.id);
  });

  it("requires a session", async () => {
    const app = setup({}, { sources });
    expect((await app.request("/api/watches")).status).toBe(401);
    expect((await app.request("/api/saved-searches")).status).toBe(401);
    expect((await app.request("/api/alerts")).status).toBe(401);
  });

  it("tracks a product and stops tracking it", async () => {
    const { app } = start();
    const user = await signUp(app);
    const productId = await firstProductId(user, "tree runner");

    const created = await user.post("/api/watches", { productId });
    expect(created.status).toBe(201);
    expect(((await created.json()) as WatchSummary).savedPriceCents).toBe(10000);
    expect((await user.post("/api/watches", { productId })).status).toBe(201);

    const list = (await (await user.get("/api/watches")).json()) as WatchSummary[];
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ productId, title: "Tree Runner Navy", currentPriceCents: 10000, dropCents: 0, storeCount: 1 });

    expect((await user.delete(`/api/watches/${productId}`)).status).toBe(204);
    expect(await (await user.get("/api/watches")).json()).toEqual([]);
    expect((await user.post("/api/watches", { productId: "00000000-0000-4000-8000-000000000000" })).status).toBe(404);
  });

  it("alerts on a real price drop, not on a small dip", async () => {
    const { app, alerts } = start();
    const user = await signUp(app);
    const productId = await firstProductId(user, "tree runner");
    await user.post("/api/watches", { productId });

    listings[0] = { ...listings[0]!, priceCents: 8000 };
    await alerts.runAll();
    let feed = (await (await user.get("/api/alerts")).json()) as AlertsResponse;
    expect(feed.unread).toBe(1);
    expect(feed.events[0]).toMatchObject({ kind: "price_drop", fromPriceCents: 10000, toPriceCents: 8000, product: { id: productId } });
    const [watched] = (await (await user.get("/api/watches")).json()) as WatchSummary[];
    expect(watched).toMatchObject({ currentPriceCents: 8000, dropCents: 2000 });

    // $1 (1.25%) less is not worth a notification.
    listings[0] = { ...listings[0]!, priceCents: 7900 };
    await alerts.runAll();
    feed = (await (await user.get("/api/alerts")).json()) as AlertsResponse;
    expect(feed.events).toHaveLength(1);

    expect((await user.post("/api/alerts/read")).status).toBe(204);
    expect(await (await user.get("/api/alerts/unread")).json()).toEqual({ unread: 0 });
  });

  it("finds new matches for a saved search", async () => {
    const { app, alerts } = start();
    const user = await signUp(app);

    const saved = (await (await user.post("/api/saved-searches", { q: "runner" })).json()) as SavedSearchSummary;
    expect(saved).toMatchObject({ query: "runner", newCount: 0, condition: null, max: null });
    expect(((await (await user.post("/api/saved-searches", { q: "Runner" })).json()) as SavedSearchSummary).id).toBe(saved.id);

    // Nothing changed: no alert.
    await alerts.runAll();
    expect(((await (await user.get("/api/alerts")).json()) as AlertsResponse).events).toEqual([]);

    listings.push(listing("trail-runner-black", "Trail Runner Black", 14500));
    await alerts.runAll();
    const [withNew] = (await (await user.get("/api/saved-searches")).json()) as SavedSearchSummary[];
    expect(withNew!.newCount).toBe(1);
    expect(withNew!.images[0]).toBe("https://stub.example/img/trail-runner-black.jpg");
    const feed = (await (await user.get("/api/alerts")).json()) as AlertsResponse;
    expect(feed.events[0]).toMatchObject({ kind: "new_matches", count: 1, read: false, search: { id: saved.id, query: "runner" } });

    expect((await user.post(`/api/saved-searches/${saved.id}/viewed`)).status).toBe(204);
    const [viewed] = (await (await user.get("/api/saved-searches")).json()) as SavedSearchSummary[];
    expect(viewed!.newCount).toBe(0);
    expect(((await (await user.get("/api/alerts")).json()) as AlertsResponse).unread).toBe(0);
  });

  it("keeps each person's searches to themselves", async () => {
    const { app } = start();
    const zack = await signUp(app, "zack@example.com");
    const sam = await signUp(app, "sam@example.com");
    const saved = (await (await zack.post("/api/saved-searches", { q: "runner", condition: "new", max: 200 })).json()) as SavedSearchSummary;
    expect(saved).toMatchObject({ condition: "new", max: 200 });

    expect(await (await sam.get("/api/saved-searches")).json()).toEqual([]);
    expect((await sam.delete(`/api/saved-searches/${saved.id}`)).status).toBe(204);
    expect((await sam.post(`/api/saved-searches/${saved.id}/viewed`)).status).toBe(404);
    expect(await (await zack.get("/api/saved-searches")).json()).toHaveLength(1);

    expect((await zack.delete(`/api/saved-searches/${saved.id}`)).status).toBe(204);
    expect(await (await zack.get("/api/saved-searches")).json()).toEqual([]);
  });

  it("rejects bad input", async () => {
    const { app } = start();
    const user = await signUp(app);
    expect((await user.post("/api/saved-searches", { q: "" })).status).toBe(400);
    expect((await user.post("/api/watches", { productId: "nope" })).status).toBe(400);
    expect((await user.delete("/api/watches/nope")).status).toBe(404);
  });
});
