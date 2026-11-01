import { expect, it } from "vitest";
import { Hono } from "hono";
import { fileURLToPath } from "node:url";
import { createApp } from "../src/app.js";
import { loadTables } from "../src/library.js";
import { rateLimit } from "../src/rate-limit.js";

const tables = await loadTables(fileURLToPath(new URL("../../../tables", import.meta.url)));

const limited = (limit: number, clock: { time: number }) => {
  const app = new Hono();
  app.use("*", rateLimit(limit, () => clock.time));
  app.get("/", (c) => c.text("ok"));
  return (ip: string) => app.request("/", { headers: { "x-real-ip": ip } });
};

it("refuses past the limit and says when to come back", async () => {
  const get = limited(2, { time: 0 });
  await get("1.1.1.1");
  await get("1.1.1.1");
  const refused = await get("1.1.1.1");
  expect(refused.status).toBe(429);
  expect(refused.headers.get("retry-after")).toBe("60");
});

it("counts each visitor separately", async () => {
  const get = limited(1, { time: 0 });
  await get("1.1.1.1");
  expect((await get("2.2.2.2")).status).toBe(200);
});

it("starts over after a minute", async () => {
  const clock = { time: 0 };
  const get = limited(1, clock);
  await get("1.1.1.1");
  expect((await get("1.1.1.1")).status).toBe(429);
  clock.time = 60_000;
  expect((await get("1.1.1.1")).status).toBe(200);
});

it("limits the API but never the health check", async () => {
  const app = createApp(tables);
  const headers = { "x-real-ip": "3.3.3.3" };
  let last = 0;
  for (let i = 0; i < 241; i++) last = (await app.request("/api/tables", { headers })).status;
  expect(last).toBe(429);
  for (let i = 0; i < 300; i++) expect((await app.request("/health", { headers })).status).toBe(200);
});
