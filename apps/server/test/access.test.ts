import { serverInfoSchema } from "@closet/shared";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { RateLimiter } from "../src/rate-limit.js";
import type { Source } from "../src/search/sources/index.js";
import { post, signUp, useTestApp } from "./helpers/setup.js";

const { setup } = useTestApp();

const shop: Source = {
  id: "shop",
  label: "Test shop",
  search: async () => [
    {
      source: "shop",
      store: { name: "Test shop", domain: "shop.example.com" },
      url: "https://shop.example.com/products/xm5",
      title: "Sony WH-1000XM5 Headphones",
      brand: "Sony",
      priceCents: 27999,
      currency: "USD",
      condition: "new",
      imageUrl: null,
      gtin: null,
      mpn: null,
      inStock: true,
    },
  ],
};
const sources = { sources: [shop], info: [{ id: "shop", label: "Test shop", enabled: true, needs: null }] };

const info = async (app: ReturnType<typeof setup>) => serverInfoSchema.parse(await (await app.request("/api/info")).json());

describe("defaults by deployment", () => {
  const base = { DATABASE_URL: "postgres://x@localhost/x", PUBLIC_URL: "http://localhost:3000", AUTH_SECRET: "x".repeat(32) };

  it("opens search and sign-ups in the cloud, keeps both closed when self-hosting", () => {
    expect(loadConfig({ ...base, DEPLOYMENT: "cloud" })).toMatchObject({ PUBLIC_SEARCH: true, SIGNUPS_ENABLED: true });
    expect(loadConfig(base)).toMatchObject({ PUBLIC_SEARCH: false, SIGNUPS_ENABLED: false });
  });

  it("lets either be set explicitly", () => {
    expect(loadConfig({ ...base, PUBLIC_SEARCH: "true", SIGNUPS_ENABLED: "true" })).toMatchObject({ PUBLIC_SEARCH: true, SIGNUPS_ENABLED: true });
    expect(loadConfig({ ...base, DEPLOYMENT: "cloud", PUBLIC_SEARCH: "false" })).toMatchObject({ PUBLIC_SEARCH: false });
  });
});

describe("public search", () => {
  it("lets signed-out visitors search and open products", async () => {
    const app = setup({ PUBLIC_SEARCH: "true" }, { sources });
    expect((await info(app)).publicSearch).toBe(true);

    const search = await app.request("/api/search?q=sony%20headphones");
    expect(search.status).toBe(200);
    const { results } = (await search.json()) as { results: { productId: string }[] };
    expect(results.length).toBe(1);

    expect((await app.request(`/api/products/${results[0]!.productId}`)).status).toBe(200);
    expect((await app.request("/api/sources")).status).toBe(200);
  });

  it("keeps everything personal behind sign-in", async () => {
    const app = setup({ PUBLIC_SEARCH: "true" }, { sources });
    for (const path of ["/api/watches", "/api/saved-searches", "/api/alerts", "/api/items", "/api/catalog/starters"]) {
      expect((await app.request(path)).status, path).toBe(401);
    }
  });

  it("requires sign-in for search when off", async () => {
    const app = setup({}, { sources });
    expect((await info(app)).publicSearch).toBe(false);
    expect((await app.request("/api/search?q=sony")).status).toBe(401);
    const user = await signUp(app);
    expect((await user.get("/api/search?q=sony")).status).toBe(200);
  });

  it("limits how often a signed-out visitor can search, but not a signed-in user", async () => {
    const app = setup({ PUBLIC_SEARCH: "true" }, { sources });
    const statuses = [];
    for (let i = 0; i < 31; i++) statuses.push((await app.request(`/api/search?q=sony${i}`)).status);
    expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
    const limited = await app.request("/api/search?q=sony");
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();

    const user = await signUp(app);
    expect((await user.get("/api/search?q=sony")).status).toBe(200);
  });
});

describe("rate limiter", () => {
  it("allows the limit per window, then says how long to wait", () => {
    let now = 0;
    const limiter = new RateLimiter(2, 60_000, () => now);
    expect(limiter.take("a")).toBeNull();
    expect(limiter.take("a")).toBeNull();
    expect(limiter.take("a")).toBe(60);
    expect(limiter.take("b")).toBeNull();
    now = 60_000;
    expect(limiter.take("a")).toBeNull();
  });
});

describe("owner setup", () => {
  const person = (email: string) => ({ name: "Someone", email, password: "correct-horse" });

  it("lets the first account in with sign-ups closed, then closes the door", async () => {
    const app = setup({ SIGNUPS_ENABLED: "false" });
    expect(await info(app)).toMatchObject({ needsSetup: true, signupsEnabled: true });

    expect((await app.request(post("/api/auth/sign-up/email", person("owner@example.com")))).status).toBe(200);
    expect(await info(app)).toMatchObject({ needsSetup: false, signupsEnabled: false });

    const second = await app.request(post("/api/auth/sign-up/email", person("guest@example.com")));
    expect(second.status).toBe(403);
    expect(((await second.json()) as { message: string }).message).toMatch(/closed/);
  });

  it("keeps sign-ups open when enabled", async () => {
    const app = setup({ SIGNUPS_ENABLED: "true" });
    expect(await info(app)).toMatchObject({ needsSetup: false, signupsEnabled: true });
    expect((await app.request(post("/api/auth/sign-up/email", person("a@example.com")))).status).toBe(200);
    expect((await app.request(post("/api/auth/sign-up/email", person("b@example.com")))).status).toBe(200);
    expect(await info(app)).toMatchObject({ needsSetup: false, signupsEnabled: true });
  });
});
