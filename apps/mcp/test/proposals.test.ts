import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import type { Fetcher } from "@skeleton/tables";
import postgres from "postgres";
import { createApp } from "../src/app.js";
import { importTables, migrate, readTables, type Sql } from "../src/db.js";
import { loadTables } from "../src/library.js";
import { watchDueTables } from "../src/watcher.js";

const url = process.env.TEST_DATABASE_URL;
const files = await loadTables(fileURLToPath(new URL("../../../tables", import.meta.url)));

type Listed = Record<string, unknown> & { cell: { value: number }; current: { value: number }; previous: { value: number } };

const proposal = { row: "Tesla Powerwall 3", column: "warranty_years", value: "12", source: "https://maker.example/warranty", quote: "Now covered for 12 years" };

describe.skipIf(!url)("proposals, history and tokens", () => {
  let sql: Sql;
  let tables: typeof files;
  let page: string;
  let app: ReturnType<typeof createApp>;

  const pages: Fetcher = async () => ({ status: 200, contentType: "text/html", body: page });

  const person = async (email: string, token: string, owner = false) => {
    const { createHash } = await import("node:crypto");
    const [user] = await sql`insert into users (email, name) values (${email}, ${email.split("@")[0]!}) returning id`;
    await sql`insert into sessions (token_hash, user_id, expires_at) values (${createHash("sha256").update(token).digest("hex")}, ${user!.id}, now() + interval '1 day')`;
    if (owner) await sql`insert into account_members (account_id, user_id) select id, ${user!.id} from accounts`;
    return { cookie: `session=${token}`, "content-type": "application/json" };
  };

  const propose = (headers: Record<string, string>, body = proposal) =>
    app.request("/api/tables/skeletable/home-batteries/proposals", { method: "POST", headers, body: JSON.stringify(body) });

  const refresh = async () => {
    tables.splice(0, tables.length, ...(await readTables(sql)));
  };

  beforeAll(() => {
    sql = postgres(url!, { onnotice: () => {} });
  });

  beforeEach(async () => {
    await sql`drop schema public cascade`;
    await sql`create schema public`;
    await migrate(sql);
    await importTables(sql, files);
    tables = await readTables(sql);
    page = "<p>Now covered for 12 years</p>";
    app = createApp(tables, undefined, { sql, clientId: "id", clientSecret: "secret", publicUrl: "https://skeletable.test", tables, refresh, pages });
  });

  afterAll(() => sql.end());

  it("takes a proposal whose quote is on its page", async () => {
    const response = await propose(await person("a@example.com", "a"));
    expect(response.status).toBe(201);
    const [listed] = (await (await app.request("/api/tables/skeletable/home-batteries/proposals")).json()) as Listed[];
    expect(listed).toMatchObject({ status: "open", check: "found", author: "a", via: "site", row: proposal.row });
    expect(listed!.cell.value).toBe(12);
    expect(listed!.current.value).toBe(10);
  });

  it("needs you to be signed in", async () => {
    expect((await propose({ "content-type": "application/json" })).status).toBe(401);
  });

  it("refuses a value its quote doesn't state", async () => {
    const response = await propose(await person("a@example.com", "a"), { ...proposal, value: "14" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "The quote has to state that exact value, word for word." });
  });

  it("refuses a quote that isn't on the page", async () => {
    page = "<p>Something else</p>";
    const response = await propose(await person("a@example.com", "a"));
    expect(await response.json()).toEqual({ error: "That quote isn't on that page." });
  });

  it("refuses a change to the same value", async () => {
    const response = await propose(await person("a@example.com", "a"), { ...proposal, value: "10", quote: "covered for 10 years" });
    expect(await response.json()).toEqual({ error: "That's already the value." });
  });

  it("refuses a malformed proposal", async () => {
    const headers = await person("a@example.com", "a");
    expect((await propose(headers, { ...proposal, source: "not a link" })).status).toBe(400);
    const empty = await app.request("/api/tables/skeletable/home-batteries/proposals", { method: "POST", headers, body: "not json" });
    expect(await empty.json()).toEqual({ error: "Add a value, a source link and the exact quote." });
  });

  it("limits how fast one visitor can propose", async () => {
    const headers = { ...(await person("a@example.com", "a")), "x-real-ip": "9.9.9.9" };
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await propose(headers)).status;
    expect(last).toBe(429);
  });

  it("marks a page it couldn't read, and still takes the proposal", async () => {
    app = createApp(tables, undefined, { sql, clientId: "id", clientSecret: "secret", publicUrl: "https://skeletable.test", tables, pages: async () => ({ status: 503, contentType: "text/html", body: "" }) });
    await propose(await person("a@example.com", "a"));
    const [listed] = await sql`select check_status from proposals`;
    expect(listed!.check_status).toBe("unreadable");
  });

  it("lets an owner accept, changing the value, keeping the old one, and resetting its checks", async () => {
    await propose(await person("a@example.com", "a"));
    const owner = await person("owner@example.com", "b", true);
    const [{ id }] = (await sql`select id from proposals`) as unknown as [{ id: string }];
    expect((await app.request(`/api/proposals/${id}/accept`, { method: "POST", headers: owner })).status).toBe(200);
    const table = tables.find((t) => t.slug === "home-batteries")!;
    const cell = table.rows[0]!.cells.warranty_years as Record<string, unknown>;
    expect(cell.value).toBe(12);
    expect(cell.confirmed).toBeUndefined();
    const [change] = (await (await app.request("/api/tables/skeletable/home-batteries/history")).json()) as Listed[];
    expect(change).toMatchObject({ row: proposal.row, column: "warranty_years", author: "a" });
    expect(change!.previous.value).toBe(10);
    expect(change!.cell.value).toBe(12);
  });

  it("lets an owner reject, changing nothing", async () => {
    await propose(await person("a@example.com", "a"));
    const owner = await person("owner@example.com", "b", true);
    const [{ id }] = (await sql`select id from proposals`) as unknown as [{ id: string }];
    await app.request(`/api/proposals/${id}/reject`, { method: "POST", headers: owner });
    expect(await (await app.request("/api/tables/skeletable/home-batteries/history")).json()).toEqual([]);
    expect((await sql`select status from proposals`)[0]!.status).toBe("rejected");
  });

  it("won't let a non-owner decide, or anyone decide twice", async () => {
    const stranger = await person("a@example.com", "a");
    await propose(stranger);
    const [{ id }] = (await sql`select id from proposals`) as unknown as [{ id: string }];
    expect((await app.request(`/api/proposals/${id}/accept`, { method: "POST", headers: stranger })).status).toBe(403);
    const owner = await person("owner@example.com", "b", true);
    await app.request(`/api/proposals/${id}/accept`, { method: "POST", headers: owner });
    expect((await app.request(`/api/proposals/${id}/reject`, { method: "POST", headers: owner })).status).toBe(403);
  });

  describe("from an agent", () => {
    const call = async (name: string, args: object, token?: string) => {
      const response = await app.request("/mcp", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(token && { authorization: `Bearer ${token}` }) },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
      });
      return ((await response.json()) as { result: { isError?: boolean; content: { text: string }[] } }).result;
    };

    const args = { slug: "home-batteries", ...proposal };

    it("needs a token", async () => {
      const result = await call("propose_change", args);
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain("token");
    });

    it("proposes with a token, under the token's owner", async () => {
      const headers = await person("a@example.com", "a");
      const created = (await (await app.request("/api/tokens", { method: "POST", headers, body: JSON.stringify({ name: "Laptop" }) })).json()) as { token: string; id: string };
      expect(created.token).toMatch(/^skt_/);
      expect((await call("propose_change", args, created.token)).isError).toBeUndefined();
      const [listed] = (await (await app.request("/api/tables/skeletable/home-batteries/proposals")).json()) as Listed[];
      expect(listed).toMatchObject({ via: "agent", author: "a" });
      await app.request(`/api/tokens/${created.id}`, { method: "DELETE", headers });
      expect((await call("propose_change", args, created.token)).isError).toBe(true);
    });

    it("keeps only a hash of a token, and lists no secrets", async () => {
      const headers = await person("a@example.com", "a");
      const { token } = (await (await app.request("/api/tokens", { method: "POST", headers, body: "{}" })).json()) as { token: string };
      expect((await sql`select token_hash from api_tokens`)[0]!.token_hash).not.toBe(token);
      expect(JSON.stringify(await (await app.request("/api/tokens", { headers })).json())).not.toContain(token);
    });
  });

  describe("daily watch", () => {
    it("saves a watch for each table once a day", async () => {
      await sql`update data_tables set watch = null`;
      await refresh();
      const today = new Date().toISOString().slice(0, 10);
      const pagesRead: string[] = [];
      const watched = await watchDueTables(sql, tables, async (address) => {
        pagesRead.push(address);
        return { status: 200, contentType: "text/html", body: "nothing" };
      }, 0);
      expect(watched).toBe(tables.length);
      expect(pagesRead.some((address) => address.includes("web.archive.org"))).toBe(false);
      const fresh = await readTables(sql);
      expect(fresh.every((table) => table.watch?.ran === today)).toBe(true);
      expect(Object.values(fresh[0]!.watch!.cells).some((cell) => cell.status === "not-on-page")).toBe(true);
      expect(await watchDueTables(sql, fresh, async () => { throw new Error("shouldn't run"); }, 0)).toBe(0);
    });

    it("keeps going when one table fails", async () => {
      await sql`update data_tables set watch = null`;
      const fresh = await readTables(sql);
      const broken = [{ ...fresh[0]!, rows: null as never }, ...fresh.slice(1)];
      expect(await watchDueTables(sql, broken, async () => ({ status: 200, contentType: "text/html", body: "x" }), 0)).toBe(fresh.length - 1);
    });
  });
});
