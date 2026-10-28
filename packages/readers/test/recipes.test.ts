import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acquireProduct } from "../src/acquisition.js";
import { browserlessTransport } from "../src/browserless.js";
import { demoFixture, demoFixtures, demoRecipe, documentTransport, runRepairDemo } from "../src/repair-demo.js";
import { RecipeStore } from "../src/recipe-store.js";
import { extractRecipe, parseAmount, recipeSchema } from "../src/recipes.js";
import { suggestRepairs, validateRecipe } from "../src/repair.js";
import { startFixtureServer } from "./helpers/fixture-server.js";

const directories: string[] = [];
afterEach(async () => { for (const dir of directories.splice(0)) await rm(dir, { recursive: true, force: true }); });
const changed = () => demoFixture("changed", "Jacket", 200, true);
const candidate = () => ({ ...demoRecipe, version: 2, price: { selector: ".current-price" } });

describe("recipe extraction", () => {
  it.each([["$1,898", 189800], ["USD 19.95", 1995], ["$0", 0], ["1,89", null], ["$20/month", null], ["$20 - $80", null], ["was $80 now $20", null]])("parses %s conservatively", (raw, expected) => {
    expect(parseAmount(String(raw))).toBe(expected);
  });
  it("records field evidence and explicit per-size availability", () => {
    const f = demoFixtures()[0]!;
    const result = extractRecipe(f.document.html, f.document.url, demoRecipe);
    expect(result.product).toEqual(f.expected);
    expect(result.evidence).toContainEqual({ field: "price", selector: ".legacy-price", raw: "$200" });
    expect(result.documentHash).toHaveLength(64);
  });
  it("rejects duplicate price elements, mismatched currency and missing variant values", () => {
    const f = demoFixtures()[0]!;
    for (const html of [f.document.html + '<p class="legacy-price">$50</p>', f.document.html.replace("$200", "EUR 200"), f.document.html.replace('data-stock="yes"', 'data-stock="maybe"')]) {
      expect(extractRecipe(html, f.document.url, demoRecipe).product).toBeNull();
    }
  });
  it("never treats the mere presence of size buttons as availability", () => {
    const f = demoFixtures()[0]!;
    const recipe = { ...demoRecipe, variants: { selector: ".size", label: { selector: ":scope", attribute: "data-size" } } };
    expect(extractRecipe(f.document.html, f.document.url, recipe).product?.variants.every((v) => v.availability === "unknown")).toBe(true);
  });
  it("rejects executable fields and wrong-origin extraction", () => {
    expect(recipeSchema.safeParse({ ...demoRecipe, code: "process.env" }).success).toBe(false);
    expect(extractRecipe("<h1>Hi</h1>", "https://other.example/products/a", demoRecipe).issues).toContain("scope: page does not match recipe");
  });
  it("requires several distinct trusted expectations", () => {
    const f = demoFixtures()[0]!;
    expect(validateRecipe(demoRecipe, [f, f, f]).passed).toBe(false);
    const wrong = { ...candidate(), price: { selector: "#installment-price" } };
    expect(validateRecipe(wrong, demoFixtures()).passed).toBe(false);
  });
});

describe("fetch escalation and preservation", () => {
  it("escalates once on extraction failure and returns rendered evidence", async () => {
    const f = demoFixtures()[0]!;
    const browser = { fetch: vi.fn(async () => ({ ...f.document, transport: "browser" as const })) };
    const result = await acquireProduct(f.document.url, demoRecipe, { http: documentTransport({ ...f.document, html: "<h1>Loading</h1>" }), browser });
    expect(result.status).toBe("ok"); expect(result.product).toEqual(f.expected);
    expect(browser.fetch).toHaveBeenCalledTimes(1); expect(result.costUsd).toBeNull();
  });
  it("does not spend a browser request after an HTTP success", async () => {
    const f = demoFixtures()[0]!;
    const browser = { fetch: vi.fn() };
    expect((await acquireProduct(f.document.url, demoRecipe, { http: documentTransport(f.document), browser })).status).toBe("ok");
    expect(browser.fetch).not.toHaveBeenCalled();
  });
  it.each(["<h1>Store temporarily closed</h1>", '<form action="/password"><input type="password"></form>', "<h1>Under maintenance</h1>"])("retains snapshots and skips repair on closure", async (html) => {
    const f = demoFixtures()[0]!;
    const doc = { ...f.document, html };
    const browser = { fetch: vi.fn() };
    const result = await acquireProduct(f.document.url, demoRecipe, { http: documentTransport(doc), browser, previous: { product: f.expected!, observedAt: f.document.observedAt } });
    expect(result.status).toBe("store_closed"); expect(result.previousRetained).toBe(true);
    expect(result.observedAt).toBe(f.document.observedAt); expect(browser.fetch).not.toHaveBeenCalled();
    expect(suggestRepairs(demoRecipe, doc)).toEqual([]);
  });
  it("does not propose code repairs for denied access", async () => {
    const f = demoFixtures()[0]!;
    const denied = { ...f.document, status: 403, html: "Denied" };
    const result = await acquireProduct(f.document.url, demoRecipe, { http: documentTransport(denied), browser: documentTransport({ ...denied, transport: "browser" }) });
    expect(result.status).toBe("access_failed"); expect(result.attempts).toHaveLength(2);
  });
  it("quarantines suspicious price changes instead of overwriting previous data", async () => {
    const f = demoFixtures()[0]!;
    const result = await acquireProduct(f.document.url, demoRecipe, {
      http: documentTransport({ ...f.document, html: f.document.html.replace("$200", "$2") }),
      previous: { product: f.expected!, observedAt: f.document.observedAt },
    });
    expect(result.status).toBe("suspicious_change"); expect(result.product).toEqual(f.expected);
  });
});

describe("review and rollback", () => {
  async function registry() {
    const dir = await mkdtemp(join(tmpdir(), "recipe-test-")); directories.push(dir);
    const store = new RecipeStore(join(dir, "registry.json"));
    await store.initialize(demoRecipe, demoFixtures(), "test reviewer"); return store;
  }
  it("demonstrates detection, proposal, wrong-fix rejection, explicit approval and rollback", async () => {
    const report = await runRepairDemo(); directories.push(join(report.registry, ".."));
    expect(report.before.status).toBe("repair_needed"); expect(report.before.previousRetained).toBe(true);
    expect(report.activeBeforeReview).toBe(1); expect(report.after.status).toBe("ok");
    expect(report.after.product?.priceCents).toBe(20000); expect(report.rolledBackVersion).toBe(1);
    expect(report.proposals.some((p) => p.status === "rejected")).toBe(true);
  });
  it("requires review and refuses changed fixtures and stale proposals", async () => {
    const store = await registry();
    const fixtures = [...demoFixtures(), changed()];
    const a = await store.propose(candidate(), fixtures);
    const b = await store.propose(candidate(), fixtures);
    expect((await store.read()).active.version).toBe(1);
    await expect(store.approve(a.id, fixtures, "")).rejects.toThrow("Reviewer");
    await expect(store.approve(a.id, demoFixtures(), "reviewer")).rejects.toThrow("Fixtures changed");
    await store.approve(a.id, fixtures, "reviewer");
    await expect(store.approve(b.id, fixtures, "reviewer")).rejects.toThrow("Active recipe changed");
    expect((await new RecipeStore(store.file).read()).active.version).toBe(2);
    await store.rollback(1, "reviewer"); expect((await store.read()).active.version).toBe(1);
    await expect(store.rollback(999, "reviewer")).rejects.toThrow("Unknown");
  });
  it("rejects expanding the recipe's origin or path scope", async () => {
    const store = await registry();
    await expect(store.propose({ ...candidate(), origin: "https://other.example.com" }, demoFixtures())).rejects.toThrow("preserve scope");
  });
});

describe("Browserless adapter", () => {
  it("keeps provider secrets server-side, validates output and preserves actual site status", async () => {
    let captured: { code: string; context: { url: string } } | undefined;
    const server = await startFixtureServer({ "/function": (req, res) => {
      let body = ""; req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => { captured = JSON.parse(body); res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ data: { url: "https://store.example.com/products/a", html: "<h1>Closed</h1>", status: 403 } })); });
    } });
    try {
      const transport = browserlessTransport({ endpoint: server.url("/function"), token: "test-token", origins: [demoRecipe.origin], providerFetchOptions: { allowPrivate: true } });
      const doc = await transport.fetch("https://store.example.com/products/a");
      expect(doc.status).toBe(403); expect(doc.transport).toBe("browser");
      expect(captured?.context.url).toBe(doc.url); expect(captured?.code).not.toContain("test-token");
      await expect(transport.fetch("https://other.example.com/products/a")).rejects.toThrow("outside approved origins");
    } finally { await server.close(); }
  });
  it("refuses private target origins and missing credentials", () => {
    expect(() => browserlessTransport({ endpoint: "https://browser.example.com/function", token: "x", origins: ["https://127.0.0.1"] })).toThrow("public HTTPS");
    expect(() => browserlessTransport({ endpoint: "https://browser.example.com/function", token: "", origins: [demoRecipe.origin] })).toThrow("token");
  });
  it("does not leak tokens from provider failures", async () => {
    const server = await startFixtureServer({ "/function": (_req, res) => res.writeHead(500).end("secret-token") });
    try {
      const transport = browserlessTransport({ endpoint: server.url("/function"), token: "secret-token", origins: [demoRecipe.origin], providerFetchOptions: { allowPrivate: true } });
      await expect(transport.fetch(`${demoRecipe.origin}/products/a`)).rejects.toThrow("Browser provider failed");
    } finally { await server.close(); }
  });
});
