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
  title: "Team keyboards",
  question: "Which keyboards are worth it?",
  topic: "Tech",
  scope: "Keyboards.",
  columns: [{ label: "Weight", type: "number", unit: "g", rule: "As the maker states it." }],
  rows: ["Alpha"],
};

type Headers = Record<string, string>;
type TeamDetails = { role: string; you: string; members: { id: string; email: string; role: string }[]; invites: { id: string; email: string }[] };

describe.skipIf(!url)("teams", () => {
  let sql: Sql;
  let tables: typeof files;
  let app: ReturnType<typeof createApp>;
  let mailed: string[];

  // The server's own way of keeping its tables current: only tables whose revision moved are reread.
  let sync: () => Promise<void>;
  const refresh = () => sync();

  const person = async (email: string) => {
    const [user] = await sql`insert into users (email, name) values (${email}, ${email.split("@")[0]!}) returning id`;
    await ensureAccount(sql, user!.id as string, email, email.split("@")[0]!);
    await sql`insert into sessions (token_hash, user_id, expires_at) values (${createHash("sha256").update(email).digest("hex")}, ${user!.id}, now() + interval '1 day')`;
    return { cookie: `session=${email}`, "content-type": "application/json" };
  };

  const send = (path: string, method: string, headers: Headers, body?: unknown) => app.request(path, { method, headers, body: JSON.stringify(body ?? {}) });
  const read = async <T>(path: string, headers: Headers) => (await (await app.request(path, { headers })).json()) as T;

  const createTeam = async (headers: Headers, name = "Acme Research") => ((await (await send("/api/teams", "POST", headers, { name })).json()) as { handle: string }).handle;

  const join = async (team: string, owner: Headers, member: Headers, email: string, role = "editor") => {
    await send(`/api/teams/${team}/invites`, "POST", owner, { email, role });
    const [invite] = await read<{ id: string }[]>("/api/invites", member);
    await send(`/api/invites/${invite!.id}/accept`, "POST", member);
  };

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
    const mail = async (to: string) => {
      mailed.push(to);
    };
    app = createApp(tables, undefined, { sql, clientId: "id", clientSecret: "secret", publicUrl: "https://skeletable.test", tables, refresh, mail });
  });

  afterAll(() => sql.end());

  it("treats the official account as a team", async () => {
    expect(await sql`select team from accounts where handle = 'skeletable'`).toEqual([{ team: true }]);
    expect(tables[0]!.ownerName).toBe("Skeletable");
  });

  it("makes a team at a free address, with you as its owner", async () => {
    const pat = await person("pat@example.com");
    expect(await createTeam(pat)).toBe("acme-research");
    expect(await createTeam(pat)).toBe("acme-research-2");
    expect(await createTeam(pat, "Explore")).toBe("explore-2");
    const { user } = await read<{ user: { accounts: string[]; teams: { handle: string; role: string }[] } }>("/api/me", pat);
    expect(user.accounts).toContain("acme-research");
    expect(user.teams[0]).toMatchObject({ handle: "acme-research", name: "Acme Research", role: "owner" });
  });

  it("shows a team to the people on it, and looks missing to anyone else", async () => {
    const pat = await person("pat@example.com");
    const team = await createTeam(pat);
    expect((await app.request(`/api/teams/${team}`, { headers: pat })).status).toBe(200);
    expect((await app.request(`/api/teams/${team}`, { headers: await person("sam@example.com") })).status).toBe(404);
    expect((await app.request(`/api/teams/${team}`)).status).toBe(404);
    expect((await app.request("/api/teams/pat", { headers: pat })).status).toBe(404);
  });

  it("holds an invite for that verified address, for them to answer", async () => {
    const pat = await person("pat@example.com");
    const sam = await person("sam@example.com");
    const lee = await person("lee@example.com");
    const team = await createTeam(pat);
    expect((await send(`/api/teams/${team}/invites`, "POST", pat, { email: "SAM@example.com" })).status).toBe(201);
    expect(mailed).toEqual(["sam@example.com"]);
    expect(await read("/api/invites", lee)).toEqual([]);
    const [invite] = await read<{ id: string; name: string; role: string }[]>("/api/invites", sam);
    expect(invite).toMatchObject({ name: "Acme Research", role: "editor" });
    expect((await send(`/api/invites/${invite!.id}/accept`, "POST", lee)).status).toBe(404);
    expect((await send(`/api/invites/${invite!.id}/accept`, "POST", sam)).status).toBe(200);
    expect((await read<TeamDetails>(`/api/teams/${team}`, pat)).members.map((member) => member.email)).toContain("sam@example.com");
    expect(await read("/api/invites", sam)).toEqual([]);
  });

  it("lets someone decline, and an owner cancel", async () => {
    const pat = await person("pat@example.com");
    const sam = await person("sam@example.com");
    const team = await createTeam(pat);
    await send(`/api/teams/${team}/invites`, "POST", pat, { email: "sam@example.com" });
    const [invite] = await read<{ id: string }[]>("/api/invites", sam);
    await send(`/api/invites/${invite!.id}/decline`, "POST", sam);
    expect((await read<TeamDetails>(`/api/teams/${team}`, pat)).invites).toEqual([]);
    await send(`/api/teams/${team}/invites`, "POST", pat, { email: "new@example.com" });
    const [pending] = (await read<TeamDetails>(`/api/teams/${team}`, pat)).invites;
    await send(`/api/teams/${team}/invites/${pending!.id}`, "DELETE", pat);
    expect((await read<TeamDetails>(`/api/teams/${team}`, pat)).invites).toEqual([]);
  });

  it("keeps managing a team to its owners, and doesn't show editors the invites", async () => {
    const pat = await person("pat@example.com");
    const sam = await person("sam@example.com");
    const outsider = await person("lee@example.com");
    const team = await createTeam(pat);
    await join(team, pat, sam, "sam@example.com");
    await send(`/api/teams/${team}/invites`, "POST", pat, { email: "new@example.com" });
    const details = await read<TeamDetails>(`/api/teams/${team}`, sam);
    expect(details).toMatchObject({ role: "editor", invites: [] });
    for (const headers of [sam, outsider]) {
      expect((await send(`/api/teams/${team}/invites`, "POST", headers, { email: "x@example.com" })).status).toBe(403);
      expect((await send(`/api/teams/${team}`, "PATCH", headers, { name: "Mine" })).status).toBe(403);
      expect((await send(`/api/teams/${team}`, "DELETE", headers)).status).toBe(403);
      expect((await send(`/api/teams/${team}/members/${details.you}`, "PATCH", headers, { role: "owner" })).status).toBe(403);
    }
    expect((await send(`/api/teams/${team}/members/${details.members.find((m) => m.role === "owner")!.id}`, "DELETE", outsider)).status).toBe(403);
  });

  it("never leaves a team without an owner", async () => {
    const pat = await person("pat@example.com");
    const sam = await person("sam@example.com");
    const team = await createTeam(pat);
    await join(team, pat, sam, "sam@example.com");
    const { you } = await read<TeamDetails>(`/api/teams/${team}`, pat);
    expect((await send(`/api/teams/${team}/members/${you}`, "DELETE", pat)).status).toBe(400);
    expect((await send(`/api/teams/${team}/members/${you}`, "PATCH", pat, { role: "editor" })).status).toBe(400);
    expect((await send("/api/me", "DELETE", pat)).status).toBe(409);
  });

  it("lets someone leave, which ends their access", async () => {
    const pat = await person("pat@example.com");
    const sam = await person("sam@example.com");
    const team = await createTeam(pat);
    await join(team, pat, sam, "sam@example.com");
    const { you } = await read<TeamDetails>(`/api/teams/${team}`, sam);
    expect((await send(`/api/teams/${team}/members/${you}`, "DELETE", sam)).status).toBe(200);
    expect((await app.request(`/api/teams/${team}`, { headers: sam })).status).toBe(404);
  });

  it("lets anyone on a team add its tables, under its name", async () => {
    const pat = await person("pat@example.com");
    const sam = await person("sam@example.com");
    const team = await createTeam(pat);
    await join(team, pat, sam, "sam@example.com");
    expect((await send("/api/tables", "POST", sam, { ...newTable, owner: team })).status).toBe(201);
    expect((await send("/api/tables", "POST", await person("lee@example.com"), { ...newTable, owner: team })).status).toBe(403);
    const [made] = await read<{ owner: string; ownerName: string }[]>("/api/tables?q=team+keyboards", {});
    expect(made).toMatchObject({ owner: team, ownerName: "Acme Research" });
  });

  it("doesn't put a person's sign-in name beside their own tables", async () => {
    const pat = await person("pat@example.com");
    await send("/api/tables", "POST", pat, newTable);
    const [made] = await read<Record<string, unknown>[]>("/api/tables?q=team+keyboards", {});
    expect(made!.owner).toBe("pat");
    expect(made).not.toHaveProperty("ownerName");
  });

  it("renames a team everywhere, and deletes it with its tables", async () => {
    const pat = await person("pat@example.com");
    const team = await createTeam(pat);
    await send("/api/tables", "POST", pat, { ...newTable, owner: team });
    await send(`/api/teams/${team}`, "PATCH", pat, { name: "Acme Labs" });
    expect((await read<{ ownerName: string }[]>("/api/tables?q=team+keyboards", {}))[0]!.ownerName).toBe("Acme Labs");
    expect((await send(`/api/teams/${team}`, "DELETE", pat)).status).toBe(200);
    expect(await read("/api/tables?q=team+keyboards", {})).toEqual([]);
    expect(await sql`select 1 from accounts where handle = ${team}`).toEqual([]);
  });

  it("won't delete the official team, even for its owner", async () => {
    const pat = await person("pat@example.com");
    await sql`insert into account_members (account_id, user_id) select a.id, u.id from accounts a, users u where a.handle = 'skeletable' and u.email = 'pat@example.com'`;
    expect((await send("/api/teams/skeletable", "DELETE", pat)).status).toBe(403);
  });
});
