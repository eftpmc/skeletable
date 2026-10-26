import http from "node:http";
import type { AddressInfo } from "node:net";
import type { NotifySettings, SearchResponse } from "@closet/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Email } from "../src/alerts/mailer.js";
import { digestDue } from "../src/alerts/notify.js";
import type { RawOffer, Source } from "../src/search/sources/index.js";
import { signUp, useTestApp } from "./helpers/setup.js";

const { setup, setupWithServices } = useTestApp();

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
  imageUrl: null,
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

/** A stand-in ntfy server that records what it's sent. */
let pushes: { path: string; body: { topic: string; title: string; message: string; click: string } }[] = [];
let ntfy: http.Server;
let ntfyUrl = "";
beforeAll(async () => {
  ntfy = http.createServer((req, res) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      pushes.push({ path: req.url ?? "", body: JSON.parse(data) });
      res.writeHead(200, { "content-type": "application/json" }).end("{}");
    });
  });
  await new Promise<void>((resolve) => ntfy.listen(0, "127.0.0.1", resolve));
  ntfyUrl = `http://127.0.0.1:${(ntfy.address() as AddressInfo).port}/skeleton-test`;
});
afterAll(() => new Promise<void>((resolve) => ntfy.close(() => resolve())));

let sent: Email[] = [];
const mailer = { send: async (email: Email) => void sent.push(email) };

beforeEach(() => {
  pushes = [];
  sent = [];
  listings = [listing("tree-runner-navy", "Tree Runner Navy", 10000)];
});

function start(withEmail = true) {
  const { app, services } = setupWithServices({ ALLOW_PRIVATE_FETCH: "true" }, { sources, mailer: withEmail ? mailer : null });
  return { app, alerts: services.alerts, notify: services.notify };
}

async function trackFirst(user: Awaited<ReturnType<typeof signUp>>, q: string) {
  const body = (await (await user.get(`/api/search?q=${encodeURIComponent(q)}`)).json()) as SearchResponse;
  const productId = body.results[0]!.productId;
  await user.post("/api/watches", { productId });
  return productId;
}

const settings = (overrides: Partial<NotifySettings> = {}) => ({ ntfyUrl: null, emailDigest: false, timezone: "UTC", ...overrides });

describe("notification settings", () => {
  it("requires a session", async () => {
    expect((await setup().request("/api/notifications")).status).toBe(401);
  });

  it("starts off and saves changes", async () => {
    const { app } = start();
    const user = await signUp(app);
    expect(await (await user.get("/api/notifications")).json()).toEqual({
      ntfyUrl: null,
      emailDigest: false,
      timezone: "UTC",
      email: "zack@example.com",
      emailAvailable: true,
      digestHour: 8,
    });
    const saved = await user.put("/api/notifications", settings({ ntfyUrl, emailDigest: true, timezone: "America/New_York" }));
    expect(await saved.json()).toMatchObject({ ntfyUrl, emailDigest: true, timezone: "America/New_York" });
    expect((await user.put("/api/notifications", settings({ ntfyUrl: "ftp://example.com/x" }))).status).toBe(400);
    expect((await user.put("/api/notifications", settings({ timezone: "Mars/Olympus" }))).status).toBe(400);
  });

  it("won't turn on email when the server can't send it", async () => {
    const { app } = start(false);
    const user = await signUp(app);
    expect(((await (await user.get("/api/notifications")).json()) as NotifySettings).emailAvailable).toBe(false);
    const response = await user.put("/api/notifications", settings({ emailDigest: true }));
    expect(response.status).toBe(400);
    expect(((await response.json()) as { message: string }).message).toMatch(/can't send email/);
  });

  it("sends a test to each channel", async () => {
    const { app } = start();
    const user = await signUp(app);
    expect((await user.post("/api/notifications/test", { channel: "ntfy" })).status).toBe(400);
    await user.put("/api/notifications", settings({ ntfyUrl }));
    expect((await user.post("/api/notifications/test", { channel: "ntfy" })).status).toBe(204);
    expect(pushes).toEqual([{ path: "/", body: expect.objectContaining({ topic: "skeleton-test", click: "http://localhost:3000/alerts" }) }]);
    expect((await user.post("/api/notifications/test", { channel: "email" })).status).toBe(204);
    expect(sent.map((e) => e.to)).toEqual(["zack@example.com"]);
  });
});

describe("delivery", () => {
  it("pushes a price drop to ntfy once", async () => {
    const { app, alerts, notify } = start();
    const user = await signUp(app);
    const productId = await trackFirst(user, "tree runner");
    await user.put("/api/notifications", settings({ ntfyUrl }));

    listings[0] = { ...listings[0]!, priceCents: 8000 };
    await alerts.runAll();
    await notify.deliver();
    expect(pushes).toHaveLength(1);
    expect(pushes[0]!.body).toEqual({
      topic: "skeleton-test",
      title: "Price drop: Allbirds Tree Runner Navy",
      message: "Now $80, down from $100.",
      click: `http://localhost:3000/p/${productId}`,
    });

    await notify.deliver();
    expect(pushes).toHaveLength(1);
  });

  it("doesn't push alerts from before ntfy was turned on, or ones already read", async () => {
    const { app, alerts, notify } = start();
    const user = await signUp(app);
    await trackFirst(user, "tree runner");
    listings[0] = { ...listings[0]!, priceCents: 8000 };
    await alerts.runAll();

    await user.put("/api/notifications", settings({ ntfyUrl }));
    await notify.deliver();
    expect(pushes).toEqual([]);

    listings[0] = { ...listings[0]!, priceCents: 6000 };
    await alerts.runAll();
    await user.post("/api/alerts/read");
    await notify.deliver();
    expect(pushes).toEqual([]);
  });

  it("emails a morning digest once a day, and only when there's news", async () => {
    const { app, alerts, notify } = start();
    const user = await signUp(app);
    await trackFirst(user, "tree runner");
    await user.post("/api/saved-searches", { q: "runner" });
    await user.put("/api/notifications", settings({ emailDigest: true }));

    listings[0] = { ...listings[0]!, priceCents: 8000 };
    listings.push(listing("wool-runner-grey", "Wool Runner Grey", 11000));
    await alerts.runAll();

    const day = (iso: string) => new Date(`${iso}Z`);
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await notify.deliver(day(`${tomorrow}T07:59:00`));
    expect(sent).toEqual([]);

    await notify.deliver(day(`${tomorrow}T08:05:00`));
    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toBe("2 new alerts from skeleton");
    expect(sent[0]!.text).toContain("1 new for “runner”");
    expect(sent[0]!.text).toContain("Price drop: Allbirds Tree Runner Navy");
    expect(sent[0]!.html).toContain("http://localhost:3000/search?q=runner");

    // Same morning: nothing more. Next morning with nothing new: no email.
    await notify.deliver(day(`${tomorrow}T12:00:00`));
    const after = new Date(day(`${tomorrow}T09:00:00`).getTime() + 24 * 60 * 60 * 1000);
    await notify.deliver(after);
    expect(sent).toHaveLength(1);
  });

  it("works out the morning in each time zone", () => {
    const at = new Date("2026-10-27T12:30:00Z"); // 08:30 in New York
    expect(digestDue({ timezone: "America/New_York", lastDigestAt: null }, at, 8)).toBe(true);
    expect(digestDue({ timezone: "America/Los_Angeles", lastDigestAt: null }, at, 8)).toBe(false);
    expect(digestDue({ timezone: "America/New_York", lastDigestAt: new Date("2026-10-27T12:10:00Z") }, at, 8)).toBe(false);
    expect(digestDue({ timezone: "America/New_York", lastDigestAt: new Date("2026-10-27T03:00:00Z") }, at, 8)).toBe(true);
  });
});
