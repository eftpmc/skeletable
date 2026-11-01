import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { ensureAccount } from "../src/accounts.js";
import { createApp } from "../src/app.js";
import { importTables, migrate, readTables, type Sql } from "../src/db.js";
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

  const pages = async () => ({ status: 200, contentType: "text/html", body: "<p>Weighs 900 g</p>" });

  const refresh = async () => {
    tables.splice(0, tables.length, ...(await readTables(sql)));
  };

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
    tables = await readTables(sql);
    app = createApp(tables, undefined, { sql, clientId: "id", clientSecret: "secret", publicUrl: "https://skeletable.test", tables, refresh, pages });
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
