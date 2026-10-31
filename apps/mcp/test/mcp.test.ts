import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../src/app.js";
import { findCell, loadTables, searchTables } from "../src/library.js";

const tables = await loadTables(fileURLToPath(new URL("../../../tables", import.meta.url)));
const app = createApp(tables);

async function rpc(method: string, params: Record<string, unknown> = {}) {
  const response = await app.request("/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  expect(response.status).toBe(200);
  return (await response.json()) as { result: { tools: { name: string; annotations: { readOnlyHint: boolean } }[]; content: { text: string }[]; isError?: boolean } };
}

const call = async (name: string, args: Record<string, unknown> = {}) => {
  const { result } = await rpc("tools/call", { name, arguments: args });
  return { isError: result.isError, text: result.content[0]!.text, json: () => JSON.parse(result.content[0]!.text) };
};

it("reports what it's serving", async () => {
  const response = await app.request("/health");
  expect(await response.json()).toEqual({ ok: true, tables: tables.length });
});

it("offers three tools, all read-only", async () => {
  const { result } = await rpc("tools/list");
  expect(result.tools.map((tool) => tool.name).sort()).toEqual(["get_cell", "get_table", "list_tables"]);
  expect(result.tools.every((tool) => tool.annotations.readOnlyHint)).toBe(true);
});

describe("list_tables", () => {
  it("lists every table without a query", async () => {
    expect((await call("list_tables")).json()).toHaveLength(tables.length);
  });

  it("finds a table by a row in it", async () => {
    const found = (await call("list_tables", { query: "steam deck" })).json();
    expect(found.map((t: { slug: string }) => t.slug)).toEqual(["handheld-gaming-pcs"]);
  });

  it("returns nothing for words no table has", async () => {
    expect((await call("list_tables", { query: "submarines" })).json()).toEqual([]);
  });
});

describe("get_table", () => {
  it("gives values, with null where no source stated one", async () => {
    const table = (await call("get_table", { slug: "handheld-gaming-pcs" })).json();
    const lcd = table.rows.find((row: { key: string }) => row.key === "Steam Deck LCD");
    expect(lcd.values.battery_wh).toBe(40);
    expect(lcd.values.weight_g).toBeNull();
    expect(table.scope).toContain("Seven named models");
  });

  it("says when a table doesn't exist", async () => {
    const result = await call("get_table", { slug: "nope" });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("list_tables");
  });
});

describe("get_cell", () => {
  it("shows a value's source and quote, whatever the row's case", async () => {
    const { cell } = (await call("get_cell", { slug: "ai-model-api-prices", row: "grok 4.7", column: "output_usd" })).json();
    expect(cell).toMatchObject({ value: 6, kind: "first-hand", source: "https://docs.x.ai/docs/models" });
    expect(cell.quote).toContain("$6.00");
  });

  it("says how a value was confirmed, and leaves it out for one read once", async () => {
    const confirmed = (await call("get_cell", { slug: "ai-model-api-prices", row: "grok 4.7", column: "output_usd" })).json();
    expect(confirmed.cell.confirmed).toBe("blind-read");
    const once = (await call("get_cell", { slug: "home-batteries", row: "Enphase IQ Battery 5P", column: "capacity_kwh" })).json();
    expect(once.cell.confirmed).toBeUndefined();
  });

  it("shows what the last watch saw", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tables-"));
    const slug = tables[0]!.slug;
    const row = tables[0]!.rows[0]!.key;
    const column = tables[0]!.columns[0]!.id;
    const { watch: _watch, ...table } = tables[0]!;
    await writeFile(join(dir, `${slug}.json`), JSON.stringify(table));
    await mkdir(join(dir, "watch"));
    await writeFile(join(dir, "watch", `${slug}.json`), JSON.stringify({ slug, ran: "2026-11-01", cells: { [`${row}/${column}`]: { status: "found", seen: "2026-11-01" } } }));
    const [loaded] = await loadTables(dir);
    expect(findCell(loaded!, row, column)?.watch).toEqual({ status: "found", seen: "2026-11-01", ran: "2026-11-01" });
    await rm(dir, { recursive: true });
  });

  it("shows where we looked for a missing value", async () => {
    const { cell } = (await call("get_cell", { slug: "deploy-platforms", row: "Heroku", column: "free_offer" })).json();
    expect(cell).toMatchObject({ missing: true, checked: ["https://www.heroku.com/pricing/"] });
  });

  it("refuses a cell that doesn't exist", async () => {
    expect((await call("get_cell", { slug: "deploy-platforms", row: "Heroku", column: "nope" })).isError).toBe(true);
  });
});

it("won't serve a table that fails its checks", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tables-"));
  const bad = structuredClone(tables[0]!);
  const cell = bad.rows[0]!.cells[bad.columns[0]!.id]!;
  if ("quote" in cell) cell.quote = "words that don't state the value";
  await writeFile(join(dir, "bad.json"), JSON.stringify(bad));
  await expect(loadTables(dir)).rejects.toThrow("bad.json");
  await rm(dir, { recursive: true });
});

it("searchTables needs every word to match", () => {
  expect(searchTables(tables, "steam submarines")).toEqual([]);
});
