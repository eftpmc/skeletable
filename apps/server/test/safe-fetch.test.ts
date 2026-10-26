import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isPrivateAddress, safeFetch } from "../src/net/safe-fetch.js";
import { html, redirect, startFixtureServer } from "./helpers/fixture-server.js";

let server: Awaited<ReturnType<typeof startFixtureServer>>;

beforeAll(async () => {
  server = await startFixtureServer({
    "/page": html("<h1>hello</h1>"),
    "/hop": redirect("/page"),
    "/loop": redirect("/loop"),
    "/big": html("x".repeat(2_000)),
    "/gzip": (_req, res) => {
      res.writeHead(200, { "content-type": "text/plain", "content-encoding": "gzip" }).end(gzipSync("squeezed"));
    },
    "/missing": (_req, res) => {
      res.writeHead(404).end();
    },
  });
});

afterAll(() => server.close());

describe("safeFetch", () => {
  it("blocks loopback and private addresses by default", async () => {
    await expect(safeFetch(server.url("/page"))).rejects.toMatchObject({ code: "blocked" });
    await expect(safeFetch("http://localhost:1/")).rejects.toMatchObject({ code: "blocked" });
    await expect(safeFetch("http://169.254.169.254/latest/meta-data")).rejects.toMatchObject({ code: "blocked" });
    await expect(safeFetch("http://[::1]/")).rejects.toMatchObject({ code: "blocked" });
  });

  it("rejects non-http links", async () => {
    await expect(safeFetch("file:///etc/passwd")).rejects.toMatchObject({ code: "invalid_url" });
    await expect(safeFetch("not a url")).rejects.toMatchObject({ code: "invalid_url" });
    await expect(safeFetch("http://user:pass@example.com/")).rejects.toMatchObject({ code: "invalid_url" });
  });

  it("fetches when private addresses are allowed (tests only)", async () => {
    const response = await safeFetch(server.url("/page"), { allowPrivate: true });
    expect(response.body.toString()).toContain("hello");
  });

  it("follows redirects and reports the final URL", async () => {
    const response = await safeFetch(server.url("/hop"), { allowPrivate: true });
    expect(response.url).toBe(server.url("/page"));
  });

  it("stops redirect loops", async () => {
    await expect(safeFetch(server.url("/loop"), { allowPrivate: true })).rejects.toThrow(/redirects/);
  });

  it("enforces the size limit", async () => {
    await expect(safeFetch(server.url("/big"), { allowPrivate: true, maxBytes: 100 })).rejects.toMatchObject({
      code: "too_large",
    });
  });

  it("decompresses gzip", async () => {
    const response = await safeFetch(server.url("/gzip"), { allowPrivate: true });
    expect(response.body.toString()).toBe("squeezed");
  });

  it("reports HTTP errors", async () => {
    await expect(safeFetch(server.url("/missing"), { allowPrivate: true })).rejects.toMatchObject({
      code: "http_error",
      status: 404,
    });
  });
});

describe("isPrivateAddress", () => {
  it.each([
    ["127.0.0.1", true],
    ["10.1.2.3", true],
    ["172.20.0.1", true],
    ["192.168.1.10", true],
    ["169.254.169.254", true],
    ["100.64.0.1", true],
    ["::1", true],
    ["fd00::1", true],
    ["::ffff:127.0.0.1", true],
    ["8.8.8.8", false],
    ["151.101.1.69", false],
    ["2606:4700::1111", false],
  ])("%s → %s", (address, expected) => {
    expect(isPrivateAddress(address)).toBe(expected);
  });
});
