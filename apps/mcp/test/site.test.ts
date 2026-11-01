import { expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Table } from "@skeleton/tables/format";
import { createApp } from "../src/app.js";
import { loadTables } from "../src/library.js";

const tables = await loadTables(fileURLToPath(new URL("../../../tables", import.meta.url)));
const app = createApp(tables);

it("lists every table", async () => {
  const list = (await (await app.request("/api/tables")).json()) as { slug: string }[];
  expect(list.map((t) => t.slug).sort()).toEqual(tables.map((t) => t.slug).sort());
});

it("says what each listed table is about and when it was checked", async () => {
  const list = (await (await app.request("/api/tables?q=steam+deck")).json()) as { topic: string; lastChecked: string }[];
  expect(list[0]).toMatchObject({ topic: "Consumer tech", lastChecked: "2026-10-31" });
});

it("says how well each listed table is checked", async () => {
  const list = (await (await app.request("/api/tables?q=enphase")).json()) as { checks: Record<string, number> }[];
  expect(list[0]!.checks).toEqual({ confirmed: 0, summary: 11, once: 1, given: 0, gap: 0 });
});

it("searches the tables", async () => {
  const list = (await (await app.request("/api/tables?q=steam+deck")).json()) as { slug: string }[];
  expect(list.map((t) => t.slug)).toEqual(["handheld-gaming-pcs"]);
});

it("gives a whole table, evidence included", async () => {
  const table = (await (await app.request("/api/tables/skeletable/ai-model-api-prices")).json()) as Table;
  expect(table.rows.find((row) => row.key === "Grok 4.7")?.cells.output_usd).toMatchObject({ quote: expect.stringContaining("$6.00") });
});

it("answers wrong API addresses with a 404", async () => {
  for (const path of ["/api/tables/skeletable/nope", "/api/tables/nobody/e-readers", "/api/nope"]) expect((await app.request(path)).status).toBe(404);
});

it("serves the built site, and its page for any address it routes itself", async () => {
  const dir = await mkdtemp(join(tmpdir(), "web-"));
  await writeFile(join(dir, "index.html"), '<title>site</title><div id="root"></div>');
  const site = createApp(tables, dir);
  expect(await (await site.request("/")).text()).toContain("Skeletable");
  const page = await (await site.request("/skeletable/e-readers")).text();
  expect(page).toContain("<title>E-readers · Skeletable</title>");
  expect(page).toContain('"@type":"Dataset"');
  expect(page).toContain("Kobo Sage");
  expect(await (await site.request("/skeletable/e-readers/sheet?sort=weight")).text()).toContain("<title>E-readers · Skeletable</title>");
  expect(await (await site.request("/robots.txt")).text()).toContain("sitemap.xml");
  expect(await (await site.request("/sitemap.xml")).text()).toContain("https://skeletable.com/skeletable/e-readers");
  expect(await (await site.request("/settings")).text()).toContain('<div id="root"></div>');
  expect(((await (await site.request("/health")).json()) as { ok: boolean }).ok).toBe(true);
  expect((await site.request("/api/nope")).status).toBe(404);
  await rm(dir, { recursive: true });
});
