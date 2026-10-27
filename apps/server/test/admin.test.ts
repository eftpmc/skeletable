import { schema } from "@closet/db";
import type { AdminStores, AdminUser, Me, SourceInfo } from "@closet/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "../src/admin/secrets.js";
import { json, startFixtureServer } from "./helpers/fixture-server.js";
import { post, signUp, useTestApp } from "./helpers/setup.js";

const { db, setup, setupWithServices } = useTestApp();

// A store website for the admin page to check: Shopify's public products feed and shop name.
let store: Awaited<ReturnType<typeof startFixtureServer>>;
beforeAll(async () => {
  store = await startFixtureServer({
    "/products.json": json({ products: [{ id: 1, title: "Tee" }] }),
    "/meta.json": json({ name: "Second Spin" }),
  });
});
afterAll(() => store.close());

const domainOf = (url: string) => new URL(url).host;
const withStores = { SHOPIFY_PROTOCOL: "http", ALLOW_PRIVATE_FETCH: "true" };

describe("roles", () => {
  it("makes the first account the owner and later ones members", async () => {
    const app = setup();
    const owner = await signUp(app, "owner@example.com");
    const member = await signUp(app, "member@example.com");
    expect(((await (await owner.get("/api/me")).json()) as Me).role).toBe("owner");
    expect(((await (await member.get("/api/me")).json()) as Me).role).toBe("member");
  });

  it("doesn't let anyone set their own role", async () => {
    const app = setup();
    await signUp(app, "owner@example.com");
    const member = await signUp(app, "member@example.com");
    // Better Auth turns the whole update down when it names the role.
    expect((await member.post("/api/auth/update-user", { name: "Sneaky", role: "owner" })).status).toBe(400);
    expect(((await (await member.get("/api/me")).json()) as Me).role).toBe("member");
    // Changing just the name (Settings → Account) works.
    expect((await member.post("/api/auth/update-user", { name: "Sneaky" })).status).toBe(200);
    expect(((await (await member.get("/api/me")).json()) as Me).name).toBe("Sneaky");

    const res = await app.request(post("/api/auth/sign-up/email", { name: "X", email: "x@example.com", password: "correct-horse", role: "owner" }));
    expect(res.status === 200 || res.status === 400).toBe(true);
    const [row] = await db.select({ role: schema.user.role }).from(schema.user).where(eq(schema.user.email, "x@example.com"));
    expect(row?.role ?? "member").toBe("member");
  });

  it("keeps the admin area to owners and admins", async () => {
    const app = setup();
    const owner = await signUp(app, "owner@example.com");
    const member = await signUp(app, "member@example.com");
    for (const path of ["/api/admin/overview", "/api/admin/stores", "/api/admin/users"]) {
      expect((await member.get(path)).status, path).toBe(403);
      expect((await owner.get(path)).status, path).toBe(200);
    }
    expect((await app.request("/api/admin/stores")).status).toBe(401);
  });

  it("lets only the owner make admins, and never changes the owner", async () => {
    const app = setup();
    const owner = await signUp(app, "owner@example.com");
    const helper = await signUp(app, "helper@example.com");
    await signUp(app, "third@example.com");
    const users = (await (await owner.get("/api/admin/users")).json()) as AdminUser[];
    const [ownerRow, helperRow, thirdRow] = users;

    expect((await owner.patch(`/api/admin/users/${helperRow!.id}`, { role: "admin" })).status).toBe(200);
    expect(((await (await helper.get("/api/me")).json()) as Me).role).toBe("admin");

    // Admins run the stores but don't hand out roles.
    expect((await helper.get("/api/admin/stores")).status).toBe(200);
    expect((await helper.patch(`/api/admin/users/${thirdRow!.id}`, { role: "admin" })).status).toBe(403);
    expect((await owner.patch(`/api/admin/users/${ownerRow!.id}`, { role: "member" })).status).toBe(403);
    expect((await owner.patch(`/api/admin/users/${helperRow!.id}`, { role: "owner" })).status).toBe(400);
  });
});

describe("stores", () => {
  it("adds a Shopify store after reading it, and searches it from then on", async () => {
    const app = setup(withStores);
    const owner = await signUp(app);
    const added = await owner.post("/api/admin/stores/shopify", { domain: store.url("/"), condition: "used" });
    expect(added.status).toBe(201);
    const view = (await added.json()) as AdminStores;
    expect(view.shopify).toEqual([expect.objectContaining({ domain: domainOf(store.url("/")), name: "Second Spin", condition: "used", origin: "admin" })]);

    const sources = (await (await owner.get("/api/sources")).json()) as SourceInfo[];
    expect(sources.find((s) => s.id === "shopify")?.enabled).toBe(true);

    // A restarted server picks the saved stores back up.
    const restarted = setupWithServices(withStores);
    await restarted.services.stores.load();
    expect(restarted.services.stores.info().find((s) => s.id === "shopify")?.enabled).toBe(true);

    expect((await owner.post("/api/admin/stores/shopify", { domain: store.url("/") })).status).toBe(422);
    const removed = (await (await owner.delete(`/api/admin/stores/shopify/${domainOf(store.url("/"))}`)).json()) as AdminStores;
    expect(removed.shopify).toEqual([]);
  });

  it("turns down an address that isn't a store it can read", async () => {
    const app = setup(withStores);
    const owner = await signUp(app);
    const missing = await owner.post("/api/admin/stores/shopify", { domain: domainOf(store.url("/")).replace(/:\d+$/, ":1") });
    expect(missing.status).toBe(422);
    expect((await owner.post("/api/admin/stores/shopify", { domain: "not a domain" })).status).toBe(422);
  });

  it("keeps API keys encrypted and never sends them back", async () => {
    const app = setup();
    const owner = await signUp(app);
    const saved = await owner.put("/api/admin/stores/bestbuy", { apiKey: "bestbuy-key-12345678" });
    const view = (await saved.json()) as AdminStores;
    expect(view.bestbuy).toEqual({ configured: true, origin: "admin", hint: "…5678" });
    expect(JSON.stringify(view)).not.toContain("bestbuy-key-12345678");

    const [row] = await db.select().from(schema.serverSetting);
    expect(JSON.stringify(row!.value)).not.toContain("bestbuy-key-12345678");

    const sources = (await (await owner.get("/api/sources")).json()) as SourceInfo[];
    expect(sources.find((s) => s.id === "bestbuy")?.enabled).toBe(true);
    expect(((await (await owner.delete("/api/admin/stores/bestbuy")).json()) as AdminStores).bestbuy.configured).toBe(false);
  });

  it("shows keys from the environment as set there, and won't overwrite them", async () => {
    const app = setup({ EBAY_CLIENT_ID: "env-client-id-abcd", EBAY_CLIENT_SECRET: "env-secret-value" });
    const owner = await signUp(app);
    const view = (await (await owner.get("/api/admin/stores")).json()) as AdminStores;
    expect(view.ebay).toMatchObject({ configured: true, origin: "env", hint: "…abcd" });
    expect((await owner.put("/api/admin/stores/ebay", { clientId: "another-id-123", clientSecret: "another-secret" })).status).toBe(422);
  });
});

describe("secrets", () => {
  it("round-trips under the same secret and not under another", () => {
    const sealed = encryptSecret("hello there", "a".repeat(32));
    expect(sealed).not.toContain("hello");
    expect(decryptSecret(sealed, "a".repeat(32))).toBe("hello there");
    expect(decryptSecret(sealed, "b".repeat(32))).toBeNull();
  });
});
