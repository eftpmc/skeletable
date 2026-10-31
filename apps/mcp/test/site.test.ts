import { expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { createApp } from "../src/app.js";
import { loadTables } from "../src/library.js";

const tables = await loadTables(fileURLToPath(new URL("../../../tables", import.meta.url)));
const app = createApp(tables);

const get = async (path: string, headers?: Record<string, string>) => {
  const response = await app.request(path, { headers });
  return { status: response.status, text: await response.text() };
};

it("lists every table", async () => {
  const { text } = await get("/");
  for (const table of tables) expect(text).toContain(`/tables/${table.slug}`);
});

it("searches the tables", async () => {
  const { text } = await get("/?q=steam+deck");
  expect(text).toContain("/tables/handheld-gaming-pcs");
  expect(text).not.toContain("/tables/e-readers");
});

it("says when nothing matches, and escapes what was typed", async () => {
  const { text } = await get(`/?q=${encodeURIComponent('<script>x"')}`);
  expect(text).toContain("No table covers");
  expect(text).not.toContain("<script>x");
  expect(text).toContain("&lt;script&gt;x");
});

it("gives the agent address the visitor actually reached", async () => {
  const { text } = await get("http://tables.example/", { "x-forwarded-proto": "https" });
  expect(text).toContain("https://tables.example/mcp");
});

it("links a value to its source and quote", async () => {
  const { text } = await get("/tables/ai-model-api-prices");
  expect(text).toContain('href="#grok-4-7--output_usd"');
  expect(text).toContain('id="grok-4-7--output_usd"');
  expect(text).toContain("https://docs.x.ai/docs/models");
  expect(text).toContain("$6.00");
});

it("shows where we looked for a missing value", async () => {
  const { text } = await get("/tables/deploy-platforms");
  expect(text).toContain('id="heroku--free_offer"');
  expect(text).toContain("https://www.heroku.com/pricing/");
  expect(text).toContain("Not stated");
});

it("gives every cell of every table its own address", async () => {
  for (const table of tables) {
    const { text } = await get(`/tables/${table.slug}`);
    const ids = [...text.matchAll(/class="evidence" id="([^"]+)"/g)].map((match) => match[1]);
    expect(ids).toHaveLength(table.rows.length * table.columns.length);
    expect(new Set(ids).size).toBe(ids.length);
  }
});

it("answers a wrong address with a page and a 404", async () => {
  for (const path of ["/tables/nope", "/nope"]) {
    const { status, text } = await get(path);
    expect(status).toBe(404);
    expect(text).toContain("See all tables");
  }
});
