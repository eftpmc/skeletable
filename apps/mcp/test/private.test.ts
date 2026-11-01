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
import { createToken } from "../src/proposals.js";

const url = process.env.TEST_DATABASE_URL;
const files = await loadTables(fileURLToPath(new URL("../../../tables", import.meta.url)));

// In every field but the title, which sets the address. Asking for an address gets it said back, which is no leak.
const SECRET = "zebrafinch";
const TITLE = "Hidden plans";
const secretTable = {
  title: TITLE,
  question: `What about ${SECRET}?`,
  topic: "Secrets",
  scope: `Only ${SECRET}.`,
  columns: [{ label: "Weight", type: "number", unit: "g", rule: "As stated." }],
  rows: [`Row ${SECRET}`],
  private: true,
};

const proposal = { row: `Row ${SECRET}`, column: "weight", value: "900", source: "https://maker.example/a", quote: "Weighs 900 g" };

type Headers = Record<string, string>;

describe.skipIf(!url)("private tables", () => {
  let sql: Sql;
  let tables: typeof files;
  let dir: string;
  let app: ReturnType<typeof createApp>;
  let owner: Headers;
  let outsider: Headers;
  let path: string;

  const pages = async () => ({ status: 200, contentType: "text/html", body: "<p>Weighs 900 g</p>" });

  const refresh = async () => {
    tables.splice(0, tables.length, ...(await readTables(sql)));
  };

  const person = async (email: string) => {
    const [user] = await sql`insert into users (email, name) values (${email}, ${email.split("@")[0]!}) returning id`;
    await ensureAccount(sql, user!.id as string, email, email.split("@")[0]!);
    await sql`insert into sessions (token_hash, user_id, expires_at) values (${createHash("sha256").update(email).digest("hex")}, ${user!.id}, now() + interval '1 day')`;
    return { cookie: `session=${email}`, "content-type": "application/json" };
  };

  const idOf = async (email: string) => (await sql`select id from users where email = ${email}`)[0]!.id as string;

  const send = (target: string, method: string, headers: Headers, body?: unknown) => app.request(target, { method, headers, body: JSON.stringify(body ?? {}) });

  const mcp = async (name: string, args: Record<string, unknown>, token?: string) => {
    const response = await app.request("/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(token && { authorization: `Bearer ${token}` }) },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    });
    return response.text();
  };

  /** Everything that can read a table, as this person sees it. */
  const sweep = async (headers: Headers, token?: string) => {
    const addresses = ["/api/tables", `/api/tables?q=${SECRET}`, `/api/tables/${path}`, `/api/tables/${path}/history`, `/api/tables/${path}/proposals`, "/sitemap.xml", `/${path}`, `/${path}/sheet`, "/pat", "/health"];
    const answers = await Promise.all(addresses.map(async (address) => [address, await (await app.request(address, { headers })).text()] as const));
    const tools = await Promise.all([
      mcp("list_tables", {}, token),
      mcp("list_tables", { query: SECRET }, token),
      mcp("get_table", { slug: path.split("/")[1] }, token),
      mcp("get_table", { slug: path }, token),
      mcp("get_cell", { slug: path, row: `Row ${SECRET}`, column: "weight" }, token),
    ]);
    return [...answers, ...tools.map((text, index) => [`mcp ${index}`, text] as const)];
  };

  const leaks = (answers: (readonly [string, string])[]) =>
    answers.filter(([, text]) => [SECRET, TITLE].some((word) => text.toLowerCase().includes(word.toLowerCase()))).map(([address]) => address);

  beforeAll(async () => {
    sql = postgres(url!, { onnotice: () => {} });
    dir = await mkdtemp(join(tmpdir(), "web-"));
    await writeFile(join(dir, "index.html"), '<title>site</title><div id="root"></div>');
  });

  beforeEach(async () => {
    await sql`drop schema public cascade`;
    await sql`create schema public`;
    await migrate(sql);
    await importTables(sql, files);
    tables = await readTables(sql);
    app = createApp(tables, dir, { sql, clientId: "id", clientSecret: "secret", publicUrl: "https://skeletable.test", tables, refresh, pages });
    owner = await person("pat@example.com");
    outsider = await person("lee@example.com");
    const made = (await (await send("/api/tables", "POST", owner, secretTable)).json()) as { owner: string; slug: string };
    path = `${made.owner}/${made.slug}`;
  });

  afterAll(async () => {
    await sql.end();
    await rm(dir, { recursive: true });
  });

  it("shows nothing of a private table to the public or to someone without access, on any path", async () => {
    expect(leaks(await sweep({}))).toEqual([]);
    expect(leaks(await sweep(outsider))).toEqual([]);
    const outsiderToken = (await createToken(sql, await idOf("lee@example.com"), "x")).token;
    expect(leaks(await sweep(outsider, outsiderToken))).toEqual([]);
    expect(leaks(await sweep({}, "skt_wrong"))).toEqual([]);
  });

  it("would notice a leak, because the same sweep finds it all for its owner", async () => {
    const found = leaks(await sweep(owner, (await createToken(sql, await idOf("pat@example.com"), "x")).token));
    expect(found).toEqual(expect.arrayContaining(["/api/tables", `/api/tables/${path}`, "mcp 0", "mcp 2", "mcp 4"]));
  });

  it("makes it look exactly like a table that doesn't exist", async () => {
    const hidden = await app.request(`/api/tables/${path}`);
    const missing = await app.request("/api/tables/pat/no-such-table");
    expect(hidden.status).toBe(404);
    expect(await hidden.text()).toBe(await missing.text());
    const [page, nothing] = await Promise.all([app.request(`/${path}`), app.request("/pat/no-such-table")]);
    const clean = (text: string) => text.replaceAll(path, "x").replaceAll("pat/no-such-table", "x");
    expect(clean(await page.text())).toBe(clean(await nothing.text()));
  });

  it("shows it to its owner, in full and marked private, with caches told to keep out", async () => {
    const response = await app.request(`/api/tables/${path}`, { headers: owner });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toMatchObject({ private: true, title: secretTable.title });
    const list = (await (await app.request("/api/tables", { headers: owner })).json()) as { slug: string; private?: boolean }[];
    expect(list.find((table) => table.slug === path.split("/")[1])?.private).toBe(true);
  });

  it("lets its owner's agent read it with a token", async () => {
    const { token } = await createToken(sql, await idOf("pat@example.com"), "x");
    expect(await mcp("get_table", { slug: path }, token)).toContain(SECRET);
    expect(await mcp("list_tables", { query: SECRET }, token)).toContain(SECRET);
  });

  it("refuses proposals from someone who can't see it, in the same words as a missing table", async () => {
    expect((await send(`/api/tables/${path}/proposals`, "POST", outsider, proposal)).status).toBe(404);
    expect(await sql`select id from proposals`).toEqual([]);
    const outsiderToken = (await createToken(sql, await idOf("lee@example.com"), "x")).token;
    await mcp("propose_change", { ...proposal, slug: path }, outsiderToken);
    expect(await sql`select id from proposals`).toEqual([]);
  });

  it("lets only the account's owners see or change who has access", async () => {
    await sql`insert into accounts (handle, name, team) values ('acme', 'Acme', true)`;
    await sql`insert into account_members (account_id, user_id) select a.id, ${await idOf("pat@example.com")} from accounts a where a.handle = 'acme'`;
    await sql`insert into account_members (account_id, user_id, role) select a.id, ${await idOf("lee@example.com")}, 'editor' from accounts a where a.handle = 'acme'`;
    const made = (await (await send("/api/tables", "POST", owner, { ...secretTable, owner: "acme", title: "Acme plans" })).json()) as { slug: string };
    const team = `acme/${made.slug}`;
    expect((await app.request(`/api/tables/${team}`, { headers: outsider })).status).toBe(200);
    expect((await app.request(`/api/tables/${team}/access`, { headers: outsider })).status).toBe(403);
    expect((await send(`/api/tables/${team}/access`, "PATCH", outsider, { private: false })).status).toBe(403);
    expect((await send(`/api/tables/${team}/people`, "POST", outsider, { email: "x@example.com" })).status).toBe(403);
    expect((await app.request(`/api/tables/${path}/access`)).status).toBe(403);
  });

  it("gives an added address access at once, and takes it away at once", async () => {
    expect((await send(`/api/tables/${path}/people`, "POST", owner, { email: "LEE@example.com" })).status).toBe(201);
    expect((await app.request(`/api/tables/${path}`, { headers: outsider })).status).toBe(200);
    expect((await send(`/api/tables/${path}/proposals`, "POST", outsider, proposal)).status).toBe(201);
    const { people } = (await (await app.request(`/api/tables/${path}/access`, { headers: owner })).json()) as { people: { id: string; email: string }[] };
    expect(people.map((added) => added.email)).toEqual(["lee@example.com"]);
    expect((await app.request(`/api/tables/${path}/access`, { headers: outsider })).status).toBe(403);
    await send(`/api/tables/${path}/people/${people[0]!.id}`, "DELETE", owner);
    expect((await app.request(`/api/tables/${path}`, { headers: outsider })).status).toBe(404);
  });

  it("doesn't show the people added to a table to anyone reading it", async () => {
    await send(`/api/tables/${path}/people`, "POST", owner, { email: "friend@example.com" });
    expect(await (await app.request(`/api/tables/${path}`, { headers: owner })).text()).not.toContain("friend@example.com");
  });

  it("hides a public table the moment it goes private, and shows it when it goes back", async () => {
    await send("/api/tables", "POST", owner, { ...secretTable, title: "Open thing", private: false });
    expect((await app.request("/api/tables/pat/open-thing")).status).toBe(200);
    expect(await (await app.request("/sitemap.xml")).text()).toContain("open-thing");
    await send("/api/tables/pat/open-thing/access", "PATCH", owner, { private: true });
    expect((await app.request("/api/tables/pat/open-thing")).status).toBe(404);
    expect(await (await app.request("/sitemap.xml")).text()).not.toContain("open-thing");
    await send("/api/tables/pat/open-thing/access", "PATCH", owner, { private: false });
    expect((await app.request("/api/tables/pat/open-thing")).status).toBe(200);
  });

  it("ends a member's access when they leave the team", async () => {
    await sql`insert into accounts (handle, name, team) values ('acme', 'Acme', true)`;
    await sql`insert into account_members (account_id, user_id) select a.id, ${await idOf("pat@example.com")} from accounts a where a.handle = 'acme'`;
    await sql`insert into account_members (account_id, user_id, role) select a.id, ${await idOf("lee@example.com")}, 'editor' from accounts a where a.handle = 'acme'`;
    const made = (await (await send("/api/tables", "POST", owner, { ...secretTable, owner: "acme" })).json()) as { slug: string };
    expect((await app.request(`/api/tables/acme/${made.slug}`, { headers: outsider })).status).toBe(200);
    await send(`/api/teams/acme/members/${await idOf("lee@example.com")}`, "DELETE", outsider);
    expect((await app.request(`/api/tables/acme/${made.slug}`, { headers: outsider })).status).toBe(404);
  });

  it("removes someone's address from tables when they delete their account", async () => {
    await send(`/api/tables/${path}/people`, "POST", owner, { email: "lee@example.com" });
    await send("/api/me", "DELETE", outsider);
    expect(await sql`select 1 from table_access where email = 'lee@example.com'`).toEqual([]);
  });

  it("keeps a table's privacy across a restart", async () => {
    await importTables(sql, await readTables(sql));
    expect((await readTables(sql)).find((table) => `${table.owner}/${table.slug}` === path)?.private).toBe(true);
  });
});
