import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  question: "Which keyboards?",
  topic: "Tech",
  scope: "Keyboards.",
  columns: [{ label: "Weight", type: "number", unit: "g", rule: "As stated." }, { label: "Switch", type: "text", rule: "As stated." }],
  rows: ["Alpha", "Beta"],
};

const proposal = { row: "Alpha", column: "weight", value: "900", source: "https://maker.example/a", quote: "Weighs 900 g" };

type Headers = Record<string, string>;
type Read = { title: string; columns: { id: string; label: string; unit?: string }[]; rows: { key: string; cells: Record<string, { value?: number }> }[] };

describe.skipIf(!url)("managing a table", () => {
  let sql: Sql;
  let tables: typeof files;
  let app: ReturnType<typeof createApp>;
  let dir: string;
  let pat: Headers;

  const pages = async () => ({ status: 200, contentType: "text/html", body: "<p>Weighs 900 g</p>" });
  const refresh = async () => {
    tables.splice(0, tables.length, ...(await readTables(sql)));
  };

  const person = async (email: string) => {
    const [user] = await sql`insert into users (email, name) values (${email}, 'Someone') returning id`;
    await ensureAccount(sql, user!.id as string, email, "Someone");
    await sql`insert into sessions (token_hash, user_id, expires_at) values (${createHash("sha256").update(email).digest("hex")}, ${user!.id}, now() + interval '1 day')`;
    return { cookie: `session=${email}`, "content-type": "application/json" };
  };

  const send = (path: string, method: string, headers: Headers, body?: unknown) => app.request(path, { method, headers, body: JSON.stringify(body ?? {}) });
  const read = async () => (await (await app.request("/api/tables/pat/my-keyboards", { headers: pat })).json()) as Read;
  const base = "/api/tables/pat/my-keyboards";

  beforeAll(async () => {
    sql = postgres(url!, { onnotice: () => {} });
    dir = await mkdtemp(join(tmpdir(), "web-"));
    await writeFile(join(dir, "index.html"), '<title>site</title><div id="root"></div>');
  });

  beforeEach(async () => {
    await sql`drop schema public cascade`;
    await sql`create schema public`;
    await migrate(sql);
    await importTables(sql, files, { managed: true });
    tables = await readTables(sql);
    app = createApp(tables, dir, { sql, clientId: "id", clientSecret: "secret", publicUrl: "https://skeletable.test", tables, refresh, pages });
    pat = await person("pat@example.com");
    await send("/api/tables", "POST", pat, newTable);
  });

  afterAll(async () => {
    await sql.end();
    await rm(dir, { recursive: true });
  });

  it("edits a table's details without moving its address", async () => {
    expect((await send(base, "PATCH", pat, { title: "Better name", question: "Q?", topic: "T", scope: "S" })).status).toBe(200);
    expect((await read()).title).toBe("Better name");
  });

  it("adds a column with waiting cells, and never reuses a removed column's id", async () => {
    const payload = { label: "Weight", type: "text", rule: "New." };
    expect((await send(`${base}/columns`, "POST", pat, payload)).status).toBe(201);
    const columns = (await read()).columns.map((column) => column.id);
    expect(columns).toEqual(["weight", "switch", "weight_2"]);
    await send(`${base}/columns/weight_2`, "DELETE", pat);
    await send(`${base}/columns`, "POST", pat, payload);
    expect((await read()).columns.map((column) => column.id)).toEqual(["weight", "switch", "weight_3"]);
    expect((await read()).rows[0]!.cells.weight_3).toMatchObject({ missing: true });
  });

  it("renames a column without touching its values", async () => {
    await send(`${base}/proposals`, "POST", pat, proposal);
    await send(`${base}/columns/weight`, "PATCH", pat, { label: "Mass", unit: "kg", rule: "Stated." });
    const table = await read();
    expect(table.columns[0]).toMatchObject({ id: "weight", label: "Mass", unit: "kg" });
    expect(table.rows[0]!.cells.weight!.value).toBe(900);
  });

  it("keeps a removed column's changes in the history, and ends its open proposals", async () => {
    await send(`${base}/proposals`, "POST", pat, proposal);
    const sam = await person("sam@example.com");
    await send(`${base}/proposals`, "POST", sam, { ...proposal, value: "900", row: "Beta" });
    expect((await send(`${base}/columns/weight`, "DELETE", pat)).status).toBe(200);
    expect((await read()).columns.map((column) => column.id)).toEqual(["switch"]);
    expect(await (await app.request(`${base}/history`)).json()).toHaveLength(1);
    expect(await sql`select status from proposals where status = 'open'`).toEqual([]);
  });

  it("won't remove a table's last column or row", async () => {
    await send(`${base}/columns/weight`, "DELETE", pat);
    expect((await send(`${base}/columns/switch`, "DELETE", pat)).status).toBe(400);
    await send(`${base}/rows`, "DELETE", pat, { key: "Alpha" });
    expect((await send(`${base}/rows`, "DELETE", pat, { key: "Beta" })).status).toBe(400);
  });

  it("renames a row and keeps its values and proposals", async () => {
    await send(`${base}/proposals`, "POST", pat, proposal);
    expect((await send(`${base}/rows`, "PATCH", pat, { key: "Alpha", to: "Beta" })).status).toBe(409);
    expect((await send(`${base}/rows`, "PATCH", pat, { key: "Alpha", to: "Omega" })).status).toBe(200);
    const table = await read();
    expect(table.rows.map((row) => row.key)).toEqual(["Omega", "Beta"]);
    expect(table.rows[0]!.cells.weight!.value).toBe(900);
  });

  it("brings a removed row back with its old values, and cells for newer columns", async () => {
    await send(`${base}/proposals`, "POST", pat, proposal);
    await send(`${base}/rows`, "DELETE", pat, { key: "Alpha" });
    await send(`${base}/columns`, "POST", pat, { label: "Colour", type: "text", rule: "New." });
    expect((await send(`${base}/rows`, "POST", pat, { key: "Alpha" })).status).toBe(201);
    const row = (await read()).rows.find((candidate) => candidate.key === "Alpha")!;
    expect(row.cells.weight!.value).toBe(900);
    expect(row.cells.colour).toMatchObject({ missing: true });
  });

  it("keeps working after a restart, whatever was removed", async () => {
    await send(`${base}/columns/weight`, "DELETE", pat);
    await send(`${base}/rows`, "DELETE", pat, { key: "Alpha" });
    await importTables(sql, files, { managed: true });
    expect((await readTables(sql)).find((table) => table.slug === "my-keyboards")!.rows).toHaveLength(1);
  });

  it("lets editors change a table, but only owners delete it", async () => {
    const lee = await person("lee@example.com");
    const leeId = (await sql`select id from users where email = 'lee@example.com'`)[0]!.id as string;
    await sql`insert into accounts (handle, name, team) values ('acme', 'Acme', true)`;
    await sql`insert into account_members (account_id, user_id) select a.id, u.id from accounts a, users u where a.handle = 'acme' and u.email = 'pat@example.com'`;
    await sql`insert into account_members (account_id, user_id, role) select id, ${leeId}, 'editor' from accounts where handle = 'acme'`;
    await send("/api/tables", "POST", pat, { ...newTable, owner: "acme" });
    expect((await send("/api/tables/acme/my-keyboards/columns", "POST", lee, { label: "New", type: "text", rule: "R." })).status).toBe(201);
    expect((await send("/api/tables/acme/my-keyboards", "DELETE", lee)).status).toBe(403);
    expect((await send("/api/tables/acme/my-keyboards", "DELETE", pat)).status).toBe(200);
    expect((await app.request("/api/tables/acme/my-keyboards")).status).toBe(404);
  });

  it("refuses anyone outside the table", async () => {
    const sam = await person("sam@example.com");
    for (const [path, method] of [[base, "PATCH"], [base, "DELETE"], [`${base}/columns`, "POST"], [`${base}/columns/weight`, "DELETE"], [`${base}/rows`, "DELETE"]] as const) {
      expect((await send(path, method, sam, {})).status).toBe(403);
      expect((await send(path, method, { "content-type": "application/json" }, {})).status).toBe(403);
    }
  });

  it("leaves the library's own tables to their files", async () => {
    await sql`insert into account_members (account_id, user_id) select a.id, u.id from accounts a, users u where a.handle = 'skeletable' and u.email = 'pat@example.com'`;
    const library = "/api/tables/skeletable/e-readers";
    expect((await send(library, "DELETE", pat)).status).toBe(409);
    expect((await send(`${library}/columns`, "POST", pat, { label: "New", type: "text", rule: "R." })).status).toBe(409);
    expect((await (await app.request(library)).json() as { managed: boolean }).managed).toBe(true);
  });

  it("shows an account's page, and only what's public about it", async () => {
    await send("/api/me", "PATCH", pat, { bio: "I test keyboards." });
    expect(await (await app.request("/api/accounts/pat")).json()).toEqual({ handle: "pat", team: false, bio: "I test keyboards." });
    expect(await (await app.request("/api/accounts/skeletable")).json()).toMatchObject({ team: true, name: "Skeletable", members: 0 });
    expect((await app.request("/api/accounts/nobody")).status).toBe(404);
    await send(base, "DELETE", pat);
    expect((await app.request("/api/accounts/pat")).status).toBe(404);
    expect((await app.request("/api/accounts/pat", { headers: pat })).status).toBe(200);
  });

  it("makes a link preview image for a public table, and none for a private one", async () => {
    const image = await app.request("/og/pat/my-keyboards.png");
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toBe("image/png");
    expect((await image.arrayBuffer()).byteLength).toBeGreaterThan(5000);
    expect(await (await app.request("/pat/my-keyboards")).text()).toContain("/og/pat/my-keyboards.png");
    await send(`${base}/access`, "PATCH", pat, { private: true });
    const hidden = await app.request("/og/pat/my-keyboards.png");
    expect(hidden.headers.get("content-type")).not.toBe("image/png");
    expect(await hidden.text()).not.toContain("My keyboards");
  });
});
