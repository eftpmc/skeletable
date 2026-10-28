import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { clientAddress, rateLimit } from "../src/limits.js";

describe("rate limits", () => {
  it("lets each address make so many requests a window, then says when to come back", async () => {
    const app = new Hono();
    app.use("*", rateLimit({ windowMs: 60_000, max: 2, key: clientAddress }));
    app.get("/", (c) => c.text("ok"));
    const from = (ip: string) => app.request("/", { headers: { "x-real-ip": ip } });
    expect((await from("1.1.1.1")).status).toBe(200);
    expect((await from("1.1.1.1")).status).toBe(200);
    const refused = await from("1.1.1.1");
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await from("2.2.2.2")).status).toBe(200);
  });

  it("takes the address the proxy added, not one the caller made up", async () => {
    const app = new Hono();
    app.get("/", (c) => c.text(clientAddress(c)));
    const seen = await app.request("/", { headers: { "x-forwarded-for": "6.6.6.6, 3.3.3.3" } });
    expect(await seen.text()).toBe("3.3.3.3");
  });
});
