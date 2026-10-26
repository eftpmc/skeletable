import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { CLIENT_IP_HEADER, clientIp, withClientIp } from "../src/client-ip.js";

function echo(trustProxy: boolean) {
  const app = new Hono();
  app.get("/", (c) => {
    const forwarded = withClientIp(c.req.raw, clientIp(c, trustProxy));
    return c.json({ ip: forwarded.headers.get(CLIENT_IP_HEADER) });
  });
  return app;
}

describe("client IP", () => {
  it("uses the last X-Forwarded-For entry when trusting a proxy", async () => {
    const response = await echo(true).request("/", { headers: { "x-forwarded-for": "6.6.6.6, 203.0.113.9" } });
    expect(await response.json()).toEqual({ ip: "203.0.113.9" });
  });

  it("ignores X-Forwarded-For when not trusting a proxy", async () => {
    const response = await echo(false).request("/", { headers: { "x-forwarded-for": "203.0.113.9" } });
    // app.request has no socket, so there is no address at all.
    expect(await response.json()).toEqual({ ip: null });
  });

  it("drops a client-supplied value for our header", async () => {
    const response = await echo(false).request("/", { headers: { [CLIENT_IP_HEADER]: "1.2.3.4" } });
    expect(await response.json()).toEqual({ ip: null });
  });
});
