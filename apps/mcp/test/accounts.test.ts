import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { ensureAccount } from "../src/accounts.js";
import { createApp } from "../src/app.js";
import { importTables, librarySync, migrate, type Sql } from "../src/db.js";
import { loadTables } from "../src/library.js";

const url = process.env.TEST_DATABASE_URL;
const files = await loadTables(fileURLToPath(new URL("../../../tables", import.meta.url)));

const newTable = {
  title: "My keyboards",
  question: "Which keyboards are worth it?",
  topic: "Tech",
  scope: "Keyboards I care about.",
  columns: [{ label: "Weight", type: "number", unit: "g", rule: "As the maker states it." }, { label: "Weight", type: "text", rule: "Second one." }],
  rows: ["Alpha", "Beta"],
};

describe.skipIf(!url)("accounts and creating tables", () => {
  let sql: Sql;
  let tables: typeof files;
  let app: ReturnType<typeof createApp>;
  let mailed: { to: string; subject: string; text: string }[];

  const pages = async () => ({ status: 200, contentType: "text/html", body: "<p>Weighs 900 g</p>" });

  // The server's own way of keeping its tables current: only tables whose revision moved are reread.
  let sync: () => Promise<void>;
  const refresh = () => sync();

  const person = async (email: string, token: string) => {
    const [user] = await sql`insert into users (email, name) values (${email}, 'Pat') returning id`;
    await ensureAccount(sql, user!.id as string, email, "Pat");
    await sql`insert into sessions (token_hash, user_id, expires_at) values (${createHash("sha256").update(token).digest("hex")}, ${user!.id}, now() + interval '1 day')`;
    return { cookie: `session=${token}`, "content-type": "application/json" };
  };

  const send = (path: string, method: string, headers: Record<string, string>, body?: unknown) => app.request(path, { method, headers, body: JSON.stringify(body ?? {}) });
  const me = async (headers: Record<string, string>) => ((await (await app.request("/api/me", { headers })).json()) as { user: { handle: string; accounts: string[] } | null }).user;

  beforeAll(() => {
    sql = postgres(url!, { onnotice: () => {} });
  });

  beforeEach(async () => {
    await sql`drop schema public cascade`;
    await sql`create schema public`;
    await migrate(sql);
    await importTables(sql, files);
    tables = [];
    sync = librarySync(sql, tables);
    await sync();
    mailed = [];
    const mail = async (to: string, subject: string, text: string) => {
      mailed.push({ to, subject, text });
    };
    app = createApp(tables, undefined, { sql, clientId: "id", clientSecret: "secret", publicUrl: "https://skeletable.test", tables, refresh, pages, mail });
  });

  afterAll(() => sql.end());

  it("gives each person their own account, and never a reserved or taken name", async () => {
    expect((await me(await person("pat@example.com", "a")))!.handle).toBe("pat");
    expect((await me(await person("pat@other.example", "b")))!.handle).toBe("pat-2");
    expect((await me(await person("explore@example.com", "c")))!.handle).toBe("explore-2");
  });

  it("lets you rename yourself, within the rules", async () => {
    const headers = await person("pat@example.com", "a");
    await person("sam@example.com", "b");
    expect((await send("/api/me", "PATCH", headers, { handle: "settings" })).status).toBe(400);
    expect((await send("/api/me", "PATCH", headers, { handle: "Bad Name!" })).status).toBe(400);
    expect((await send("/api/me", "PATCH", headers, { handle: "sam" })).status).toBe(409);
    expect((await send("/api/me", "PATCH", headers, { handle: "patricia", name: "Patricia" })).status).toBe(200);
    expect((await me(headers))!.handle).toBe("patricia");
  });

  it("creates a table under your account, with its cells waiting to be filled", async () => {
    const headers = await person("pat@example.com", "a");
    const response = await send("/api/tables", "POST", headers, newTable);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ owner: "pat", slug: "my-keyboards" });
    const table = tables.find((t) => t.owner === "pat")!;
    expect(table.columns.map((column) => column.id)).toEqual(["weight", "weight_2"]);
    expect(table.rows[0]!.cells.weight).toMatchObject({ missing: true, checked: [] });
  });

  it("names a second table with the same title differently", async () => {
    const headers = await person("pat@example.com", "a");
    await send("/api/tables", "POST", headers, newTable);
    expect(await (await send("/api/tables", "POST", headers, newTable)).json()).toEqual({ owner: "pat", slug: "my-keyboards-2" });
  });

  it("refuses a bad table, or anyone signed out", async () => {
    const headers = await person("pat@example.com", "a");
    expect((await send("/api/tables", "POST", { "content-type": "application/json" }, newTable)).status).toBe(401);
    expect((await send("/api/tables", "POST", headers, { ...newTable, rows: [] })).status).toBe(400);
    expect((await send("/api/tables", "POST", headers, { ...newTable, rows: ["Same", "Same"] })).status).toBe(400);
  });

  it("applies an owner's edit straight away, and sends a stranger's for review", async () => {
    const owner = await person("pat@example.com", "a");
    const stranger = await person("sam@example.com", "b");
    await send("/api/tables", "POST", owner, newTable);
    const edit = { row: "Alpha", column: "weight", value: "900", source: "https://maker.example/a", quote: "Weighs 900 g" };
    const strangers = (await (await send("/api/tables/pat/my-keyboards/proposals", "POST", stranger, edit)).json()) as { applied?: boolean };
    expect(strangers.applied).toBeUndefined();
    expect(tables.find((t) => t.owner === "pat")!.rows[0]!.cells.weight).toMatchObject({ missing: true });
    const owners = (await (await send("/api/tables/pat/my-keyboards/proposals", "POST", owner, edit)).json()) as { applied?: boolean };
    expect(owners.applied).toBe(true);
    expect(tables.find((t) => t.owner === "pat")!.rows[0]!.cells.weight).toMatchObject({ value: 900 });
  });

  it("keeps a draft to its people, and leaves unproven values out when it's published", async () => {
    const owner = await person("pat@example.com", "a");
    const stranger = await person("sam@example.com", "b");
    const body = { title: "Sketch", draft: true, proof: "required", columns: [{ label: "Weight", type: "number", unit: "g" }], rows: ["Alpha", "Beta"] };
    expect((await send("/api/tables", "POST", owner, body)).status).toBe(201);
    await send("/api/tables/pat/sketch/grid", "POST", owner, { cells: [{ row: "Alpha", column: "weight", value: "900" }, { row: "Beta", column: "weight", value: "850" }] });
    const held = () => tables.find((t) => t.owner === "pat" && t.slug === "sketch")!;
    expect(held()).toMatchObject({ draft: true, private: true });
    expect(held().rows[1]!.cells.weight).toMatchObject({ missing: true, unproven: 850 });
    expect((await app.request("/api/tables/pat/sketch", { headers: stranger })).status).toBe(404);

    expect((await send("/api/tables/pat/sketch/publish", "POST", owner, { private: false })).status).toBe(400);
    await send("/api/tables/pat/sketch", "PATCH", owner, { title: "Sketch", question: "How heavy?", topic: "Tech", scope: "These two." });
    await send("/api/tables/pat/sketch/columns/weight", "PATCH", owner, { label: "Weight", unit: "g", rule: "As stated." });
    await send("/api/tables/pat/sketch/proposals", "POST", owner, { row: "Alpha", column: "weight", value: "900", source: "https://maker.example/a", quote: "Weighs 900 g" });
    expect((await send("/api/tables/pat/sketch/publish", "POST", stranger, { private: false })).status).toBe(403);
    expect((await send("/api/tables/pat/sketch/publish", "POST", owner, { private: false })).status).toBe(200);

    expect(held().draft).toBeUndefined();
    expect(held().rows[0]!.cells.weight).toMatchObject({ value: 900 });
    expect(held().rows[1]!.cells.weight).not.toHaveProperty("unproven");
    expect((await app.request("/api/tables/pat/sketch", { headers: stranger })).status).toBe(200);
    expect((await send("/api/tables/pat/sketch/publish", "POST", owner, { private: false })).status).toBe(409);
  });

  it("opens a blank sheet, reusing an untouched one", async () => {
    const owner = await person("pat@example.com", "a");
    expect(await (await send("/api/tables/blank", "POST", owner)).json()).toMatchObject({ owner: "pat", slug: "untitled-table" });
    expect(await (await send("/api/tables/blank", "POST", owner)).json()).toEqual({ owner: "pat", slug: "untitled-table" });
    expect(tables.filter((t) => t.owner === "pat")).toHaveLength(1);
    expect(tables.find((t) => t.owner === "pat")).toMatchObject({ draft: true, private: true, rows: [], columns: [], proof: "optional" });
  });

  it("takes what's typed or pasted into a draft that requires proof as values waiting for it, and leaves proof alone", async () => {
    const owner = await person("pat@example.com", "a");
    await send("/api/tables/blank", "POST", owner);
    await send("/api/tables/pat/untitled-table/proof", "PUT", owner, { proof: "required" });
    const grid = "/api/tables/pat/untitled-table/grid";
    const held = () => tables.find((t) => t.owner === "pat")!;
    expect((await send(grid, "POST", owner, {
      addColumns: [{ label: "Weight", type: "number", unit: "g" }, { label: "Colour", type: "text" }],
      addRows: ["Alpha", "Beta"],
      cells: [{ row: "Alpha", column: "new:0", value: "1,200" }, { row: "Beta", column: "new:1", value: "Black" }],
    })).status).toBe(200);
    expect(held().columns.map((column) => column.id)).toEqual(["weight", "colour"]);
    expect(held().rows[0]!.cells.weight).toMatchObject({ missing: true, unproven: 1200 });
    expect(held().rows[1]!.cells.colour).toMatchObject({ unproven: "Black" });

    await send(grid, "POST", owner, { cells: [{ row: "Alpha", column: "weight", value: "" }] });
    expect(held().rows[0]!.cells.weight).not.toHaveProperty("unproven");

    await send("/api/tables/pat/untitled-table/proposals", "POST", owner, { row: "Alpha", column: "weight", value: "900", source: "https://maker.example/a", quote: "Weighs 900 g" });
    await send(grid, "POST", owner, { cells: [{ row: "Alpha", column: "weight", value: "5" }] });
    expect(held().rows[0]!.cells.weight).toMatchObject({ value: 900 });
  });

  it("lets a draft's address follow its title, until it's published", async () => {
    const owner = await person("pat@example.com", "a");
    await send("/api/tables/blank", "POST", owner);
    const details = { title: "My keyboards", question: "", topic: "", scope: "" };
    expect(await (await send("/api/tables/pat/untitled-table", "PATCH", owner, details)).json()).toMatchObject({ slug: "my-keyboards" });
    expect(tables.some((t) => t.owner === "pat" && t.slug === "my-keyboards")).toBe(true);
    expect(await (await send("/api/tables/pat/my-keyboards", "PATCH", owner, details)).json()).toMatchObject({ slug: "my-keyboards" });
  });

  it("won't take a published table without its details", async () => {
    const headers = await person("pat@example.com", "a");
    expect((await send("/api/tables", "POST", headers, { ...newTable, scope: "" })).status).toBe(400);
    expect((await send("/api/tables", "POST", headers, { ...newTable, columns: [{ label: "Weight", type: "text" }] })).status).toBe(400);
  });

  it("finds the words on a page that state a value", async () => {
    const owner = await person("pat@example.com", "a");
    await send("/api/tables", "POST", owner, newTable);
    const search = async (value: string) => (await send("/api/tables/pat/my-keyboards/quotes", "POST", owner, { column: "weight", value, source: "https://maker.example/a" })).json();
    expect(await search("900")).toEqual({ quotes: ["Weighs 900 g"] });
    expect(await search("901")).toEqual({ quotes: [] });
    expect(await search("not a number")).toEqual({ quotes: [] });
  });

  it("lets only the owner add a row, once", async () => {
    const owner = await person("pat@example.com", "a");
    const stranger = await person("sam@example.com", "b");
    await send("/api/tables", "POST", owner, newTable);
    expect((await send("/api/tables/pat/my-keyboards/rows", "POST", stranger, { key: "Gamma" })).status).toBe(403);
    expect((await send("/api/tables/pat/my-keyboards/rows", "POST", owner, { key: "Gamma" })).status).toBe(201);
    expect((await send("/api/tables/pat/my-keyboards/rows", "POST", owner, { key: "Gamma" })).status).toBe(409);
    expect(tables.find((t) => t.owner === "pat")!.rows.map((row) => row.key)).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("shows owners what's waiting for them", async () => {
    const owner = await person("pat@example.com", "a");
    const stranger = await person("sam@example.com", "b");
    await send("/api/tables", "POST", owner, newTable);
    await send("/api/tables/pat/my-keyboards/proposals", "POST", stranger, { row: "Alpha", column: "weight", value: "900", source: "https://maker.example/a", quote: "Weighs 900 g" });
    const inbox = (await (await app.request("/api/inbox", { headers: owner })).json()) as { title: string }[];
    expect(inbox.map((item) => item.title)).toEqual(["My keyboards"]);
    expect(await (await app.request("/api/inbox", { headers: stranger })).json()).toEqual([]);
  });

  it("emails the owner about a stranger's proposal, unless they've opted out", async () => {
    const owner = await person("pat@example.com", "a");
    const stranger = await person("sam@example.com", "b");
    await send("/api/tables", "POST", owner, newTable);
    const proposal = { row: "Alpha", column: "weight", value: "900", source: "https://maker.example/a", quote: "Weighs 900 g" };
    await send("/api/tables/pat/my-keyboards/proposals", "POST", stranger, proposal);
    expect(mailed).toHaveLength(1);
    expect(mailed[0]).toMatchObject({ to: "pat@example.com", subject: "New proposal on My keyboards" });
    expect(mailed[0]!.text).toContain("https://skeletable.test/pat/my-keyboards/proposals");
    await send("/api/tables/pat/my-keyboards/proposals", "POST", owner, proposal);
    expect(mailed).toHaveLength(1);
    await send("/api/me", "PATCH", owner, { emailUpdates: false });
    await send("/api/tables/pat/my-keyboards/proposals", "POST", stranger, { ...proposal, value: "900.0", quote: "Weighs 900.0 g" });
    expect(mailed).toHaveLength(1);
  });

  it("keeps the proposal when email fails", async () => {
    const owner = await person("pat@example.com", "a");
    const stranger = await person("sam@example.com", "b");
    await send("/api/tables", "POST", owner, newTable);
    app = createApp(tables, undefined, { sql, clientId: "id", clientSecret: "secret", publicUrl: "https://skeletable.test", tables, refresh, pages, mail: async () => { throw new Error("down"); } });
    const response = await send("/api/tables/pat/my-keyboards/proposals", "POST", stranger, { row: "Alpha", column: "weight", value: "900", source: "https://maker.example/a", quote: "Weighs 900 g" });
    expect(response.status).toBe(201);
  });

  it("deletes your account, your tables and your details, and keeps your proposals nameless", async () => {
    const pat = await person("pat@example.com", "a");
    const sam = await person("sam@example.com", "b");
    await send("/api/tables", "POST", sam, newTable);
    await send("/api/tables", "POST", pat, newTable);
    await send("/api/tables/sam/my-keyboards/proposals", "POST", pat, { row: "Alpha", column: "weight", value: "900", source: "https://maker.example/a", quote: "Weighs 900 g" });
    expect((await send("/api/me", "DELETE", pat)).status).toBe(200);
    expect(await me(pat)).toBeNull();
    expect(tables.some((t) => t.owner === "pat")).toBe(false);
    expect(await sql`select 1 from users where email = 'pat@example.com'`).toHaveLength(0);
    const [left] = (await (await app.request("/api/tables/sam/my-keyboards/proposals")).json()) as { author: string }[];
    expect(left!.author).toBe("Someone");
  });

  it("lets only the official account block someone, which stops them everywhere", async () => {
    const pat = await person("pat@example.com", "a");
    const admin = await person("boss@example.com", "b");
    await sql`insert into account_members (account_id, user_id) select a.id, u.id from accounts a, users u where a.handle = 'skeletable' and u.email = 'boss@example.com'`;
    await send("/api/tables", "POST", admin, newTable);
    await send("/api/tables/boss/my-keyboards/proposals", "POST", pat, { row: "Alpha", column: "weight", value: "900", source: "https://maker.example/a", quote: "Weighs 900 g" });
    const [{ id }] = (await sql`select id from proposals`) as unknown as [{ id: string }];
    expect((await send(`/api/proposals/${id}/block`, "POST", pat)).status).toBe(403);
    expect((await send(`/api/proposals/${id}/block`, "POST", admin)).status).toBe(200);
    expect(await me(pat)).toBeNull();
    expect((await sql`select status from proposals`)[0]!.status).toBe("rejected");
  });

  it("counts page visits without recording who", async () => {
    await app.request("/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const [count] = await sql`select name, count from daily_counts where name = 'mcp'`;
    expect(count).toMatchObject({ name: "mcp", count: "1" });
  });
});
