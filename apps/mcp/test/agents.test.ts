import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { ensureAccount } from "../src/accounts.js";
import { createApp } from "../src/app.js";
import { importTables, migrate, readTables, type Sql } from "../src/db.js";
import { loadTables } from "../src/library.js";
import { createToken } from "../src/proposals.js";

const url = process.env.TEST_DATABASE_URL;
const files = await loadTables(fileURLToPath(new URL("../../../tables", import.meta.url)));

describe.skipIf(!url)("building a table through an agent", () => {
  let sql: Sql;
  let tables: typeof files;
  let app: ReturnType<typeof createApp>;
  let token: string;
  let opened: string[];

  const pages = async (page: string) => {
    opened.push(page);
    return { status: 200, contentType: "text/html", body: "<p>Weighs 900 g</p>" };
  };
  const refresh = async () => {
    tables.splice(0, tables.length, ...(await readTables(sql)));
  };

  const person = async (email: string) => {
    const [user] = await sql`insert into users (email, name) values (${email}, 'Pat') returning id`;
    await ensureAccount(sql, user!.id as string, email, "Pat");
    return (await createToken(sql, user!.id as string, "Agent")).token;
  };

  const call = async (name: string, args: Record<string, unknown>, bearer = token) => {
    const response = await app.request("/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${bearer}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    });
    const { result } = (await response.json()) as { result: { content: { text: string }[]; isError?: boolean } };
    return { isError: result.isError, text: result.content[0]!.text, json: () => JSON.parse(result.content[0]!.text) };
  };

  const draft = { title: "Keyboards", columns: [{ label: "Weight", type: "number", unit: "g" }, { label: "Colour", type: "text" }], rows: ["Alpha", "Beta"] };
  const held = () => tables.find((table) => table.owner === "pat" && table.slug === "keyboards")!;

  beforeAll(() => {
    sql = postgres(url!, { onnotice: () => {} });
  });

  beforeEach(async () => {
    await sql`drop schema public cascade`;
    await sql`create schema public`;
    await migrate(sql);
    await importTables(sql, files);
    tables = await readTables(sql);
    opened = [];
    app = createApp(tables, undefined, { sql, clientId: "id", clientSecret: "secret", publicUrl: "https://skeletable.test", tables, refresh, pages });
    token = await person("pat@example.com");
  });

  afterAll(() => sql.end());

  it("makes a private draft, and says where to watch it", async () => {
    const created = (await call("create_table", draft)).json();
    expect(created).toEqual({ owner: "pat", slug: "keyboards", url: "https://skeletable.test/pat/keyboards/sheet", columns: [{ id: "weight", label: "Weight" }, { id: "colour", label: "Colour" }] });
    expect(held()).toMatchObject({ draft: true, private: true });
    expect((await app.request("/api/tables/pat/keyboards")).status).toBe(404);
  });

  it("won't build for anyone without a token, or on another account", async () => {
    expect((await call("create_table", draft, "wrong")).text).toContain("needs a token");
    expect((await call("create_table", { ...draft, owner: "skeletable" })).isError).toBe(true);
  });

  it("saves proved values, gives each bad cell a reason, and opens each page once", async () => {
    await call("create_table", draft);
    const source = "https://maker.example/a";
    const result = (await call("fill_cells", {
      slug: "keyboards",
      cells: [
        { row: "Alpha", column: "weight", value: "900", source, quote: "Weighs 900 g" },
        { row: "Beta", column: "weight", value: "900", source, quote: "Weighs 900 grams" },
        { row: "Beta", column: "colour", value: "Black", source, quote: "Weighs 900 g" },
        { row: "Gamma", column: "weight", value: "900", source, quote: "Weighs 900 g" },
      ],
    })).json();
    expect(result).toMatchObject({ saved: 1, of: 4 });
    expect(result.results[1].error).toContain("isn't on that page");
    expect(result.results[2].error).toContain("exact value");
    expect(result.results[3].error).toContain("no such cell");
    expect(held().rows[0]!.cells.weight).toMatchObject({ value: 900, read: expect.any(String) });
    expect(held().rows[0]!.cells.weight).not.toHaveProperty("confirmed");
    expect(opened.filter((page) => page === source)).toHaveLength(1);
  });

  it("records where it looked, and a source with no such value", async () => {
    await call("create_table", draft);
    const checked = ["https://maker.example/a"];
    await call("fill_cells", { slug: "keyboards", cells: [{ row: "Alpha", column: "weight", checked }, { row: "Beta", column: "weight", checked, none_stated: true }] });
    expect(held().rows[0]!.cells.weight).toMatchObject({ missing: true, checked });
    expect(held().rows[1]!.cells.weight).toMatchObject({ missing: true, checked, absent: true });
    expect((await call("fill_cells", { slug: "keyboards", cells: [{ row: "Alpha", column: "colour" }] })).json().results[0].error).toContain("where you looked");
  });

  it("adds rows, skipping names it already has", async () => {
    await call("create_table", draft);
    expect((await call("add_rows", { slug: "keyboards", rows: ["Beta", "Gamma", "Gamma"] })).json()).toEqual({ added: 1 });
    expect(held().rows.map((row) => row.key)).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("can't write to a published table, or someone else's draft", async () => {
    await call("create_table", draft);
    await sql`update data_tables set draft = false, question = 'Q', topic = 'T', scope = 'S' where slug = 'keyboards'`;
    await sql`update table_columns set rule = 'R' where table_id = (select id from data_tables where slug = 'keyboards')`;
    await refresh();
    const cell = { row: "Alpha", column: "weight", value: "900", source: "https://maker.example/a", quote: "Weighs 900 g" };
    const published = await call("fill_cells", { slug: "keyboards", cells: [cell] });
    expect(published.json().results[0].error).toContain("propose_change");

    const other = await person("sam@example.com");
    const strangers = await call("fill_cells", { slug: "pat/keyboards", cells: [cell] }, other);
    expect(strangers.json().results[0].error).toContain("don't run");
    const official = await call("fill_cells", { slug: "skeletable/data-breach-laws", cells: [cell] });
    expect(official.json().results[0].error).toContain("don't run");
  });
});
