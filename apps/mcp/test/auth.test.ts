import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { createApp } from "../src/app.js";
import { importTables, migrate, type Sql } from "../src/db.js";
import { loadTables } from "../src/library.js";

const url = process.env.TEST_DATABASE_URL;
const tables = await loadTables(fileURLToPath(new URL("../../../tables", import.meta.url)));

type Profile = { email?: string; email_verified?: boolean; name?: string };

describe.skipIf(!url)("sign-in", () => {
  let sql: Sql;
  let profile: Profile;
  let tokenStatus: number;

  const google = (async (input: string | URL | Request) =>
    String(input).includes("token")
      ? new Response(JSON.stringify({ access_token: "from-google" }), { status: tokenStatus })
      : new Response(JSON.stringify(profile))) as typeof fetch;

  const site = () =>
    createApp(tables, undefined, { sql, clientId: "id", clientSecret: "secret", publicUrl: "https://skeletable.test", ownerEmail: "owner@example.com", fetcher: google, tables });

  const cookieFrom = (response: Response, name: string) =>
    response.headers.getSetCookie().find((line) => line.startsWith(`${name}=`))?.split(";")[0];

  const signIn = async () => {
    const app = site();
    const start = await app.request("/auth/google");
    const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
    const callback = await app.request(`/auth/google/callback?code=abc&state=${state}`, { headers: { cookie: cookieFrom(start, "auth_state")! } });
    return { app, callback, session: cookieFrom(callback, "session") };
  };

  beforeAll(() => {
    sql = postgres(url!, { onnotice: () => {} });
  });

  beforeEach(async () => {
    await sql`drop schema public cascade`;
    await sql`create schema public`;
    await migrate(sql);
    await importTables(sql, tables);
    profile = { email: "someone@example.com", email_verified: true, name: "Someone" };
    tokenStatus = 200;
  });

  afterAll(() => sql.end());

  it("sends you to Google with a one-time state and the exact redirect address", async () => {
    const response = await site().request("/auth/google");
    const target = new URL(response.headers.get("location")!);
    expect(target.origin).toBe("https://accounts.google.com");
    expect(target.searchParams.get("redirect_uri")).toBe("https://skeletable.test/auth/google/callback");
    expect(target.searchParams.get("state")).toBeTruthy();
    expect(response.headers.get("set-cookie")).toMatch(/HttpOnly/i);
  });

  it("signs you in and remembers you", async () => {
    const { app, callback, session } = await signIn();
    expect(callback.headers.get("location")).toBe("/");
    expect(callback.headers.getSetCookie().join()).toMatch(/session=.*HttpOnly.*Secure/i);
    const me = await (await app.request("/api/me", { headers: { cookie: session! } })).json();
    expect(me).toEqual({ canSignIn: true, user: { email: "someone@example.com", name: "Someone", handle: "someone", emailUpdates: true, accounts: ["someone"], teams: [], invites: 0 } });
  });

  it("takes you back to the page you came from, but only on this site", async () => {
    const landing = async (next: string) => {
      const app = site();
      const start = await app.request(`/auth/google?next=${encodeURIComponent(next)}`);
      const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
      const cookie = [cookieFrom(start, "auth_state"), cookieFrom(start, "auth_next")].join("; ");
      return (await app.request(`/auth/google/callback?code=abc&state=${state}`, { headers: { cookie } })).headers.get("location");
    };
    expect(await landing("/pat/plans/sheet?sort=price&f=plan:Pro")).toBe("/pat/plans/sheet?sort=price&f=plan:Pro");
    for (const elsewhere of ["https://evil.example", "//evil.example", "/\\evil.example", "/\tevil.example", "evil.example"]) expect(await landing(elsewhere)).toBe("/");
  });

  it("keeps only a hash of the session", async () => {
    const { session } = await signIn();
    const [stored] = await sql`select token_hash from sessions`;
    expect(stored!.token_hash).not.toBe(session!.split("=")[1]);
  });

  it("gives the owner the official account as well as their own, and nobody else", async () => {
    profile = { email: "Owner@Example.com", email_verified: true };
    const { app, session } = await signIn();
    const me = (await (await app.request("/api/me", { headers: { cookie: session! } })).json()) as { user: { accounts: string[] } };
    expect(me.user.accounts).toEqual(["owner", "skeletable"]);
  });

  it("refuses a callback without the matching state", async () => {
    const response = await site().request("/auth/google/callback?code=abc&state=forged", { headers: { cookie: "auth_state=real" } });
    expect(response.headers.get("location")).toBe("/?signin=failed");
    expect(await sql`select id from sessions`).toHaveLength(0);
  });

  it("refuses an unverified email", async () => {
    profile = { email: "someone@example.com", email_verified: false };
    expect((await signIn()).session).toBeUndefined();
    expect(await sql`select id from users`).toHaveLength(0);
  });

  it("refuses when Google won't give a token", async () => {
    tokenStatus = 400;
    const { callback } = await signIn();
    expect(callback.headers.get("location")).toBe("/?signin=failed");
  });

  it("signs you out for good", async () => {
    const { app, session } = await signIn();
    const out = await app.request("/auth/logout", { method: "POST", headers: { cookie: session! } });
    expect(out.status).toBe(303);
    expect(await (await app.request("/api/me", { headers: { cookie: session! } })).json()).toMatchObject({ user: null });
  });

  it("ignores an expired session", async () => {
    const { app, session } = await signIn();
    await sql`update sessions set expires_at = now() - interval '1 minute'`;
    expect(await (await app.request("/api/me", { headers: { cookie: session! } })).json()).toMatchObject({ user: null });
  });
});

describe("without sign-in set up", () => {
  const app = createApp(tables);

  it("says so, so the site shows no dead button", async () => {
    expect(await (await app.request("/api/me")).json()).toEqual({ canSignIn: false, user: null });
  });

  it("sends www to the bare domain", async () => {
    const response = await app.request("http://www.skeletable.test/explore?x=1");
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("https://skeletable.test/explore?x=1");
  });
});
