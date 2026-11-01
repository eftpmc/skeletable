import { createHash, randomBytes } from "node:crypto";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Fetcher } from "@skeleton/tables";
import { accountRoutes, ensureAccount, runsTable } from "./accounts.js";
import type { Sql } from "./db.js";
import type { PublishedTable } from "./library.js";
import { createToken, decideProposal, deleteToken, listProposals, listTokens, submitProposal, tableHistory } from "./proposals.js";
import { rateLimit } from "./rate-limit.js";

export type AuthConfig = {
  sql: Sql;
  clientId: string;
  clientSecret: string;
  publicUrl: string;
  // Whoever signs in with this email runs the official account.
  ownerEmail?: string;
  fetcher?: typeof fetch;
  tables: PublishedTable[];
  refresh?: () => Promise<unknown>;
  // Reads a proposal's source. Only tests swap this.
  pages?: Fetcher;
};

const OFFICIAL_ACCOUNT = "skeletable";
const SESSION_COOKIE = "session";
const STATE_COOKIE = "auth_state";
const SESSION_DAYS = 30;

// Each proposal opens a web page, so these are far fewer than other requests.
const PROPOSALS_PER_MINUTE = 10;

const proposalBody = z.object({
  row: z.string().max(200),
  column: z.string().max(80),
  value: z.string().max(300),
  source: z.string().url().max(2000),
  quote: z.string().min(1).max(400),
  note: z.string().max(500).optional(),
});

const authorizeUrl = "https://accounts.google.com/o/oauth2/v2/auth";
const tokenUrl = "https://oauth2.googleapis.com/token";
const profileUrl = "https://openidconnect.googleapis.com/v1/userinfo";

// A stolen copy of the sessions table can't be used to sign in, because only the hash is kept.
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** Who a session cookie belongs to, and the accounts they can act as. */
async function currentUser(sql: Sql, token: string | undefined) {
  if (!token) return null;
  const [user] = await sql`
    select u.id, u.email, u.name, a.handle from sessions s join users u on u.id = s.user_id left join accounts a on a.id = u.account_id
    where s.token_hash = ${hash(token)} and s.expires_at > now() and u.blocked_at is null`;
  if (!user) return null;
  const accounts = await sql`
    select a.handle from account_members m join accounts a on a.id = m.account_id where m.user_id = ${user.id} order by a.handle`;
  return { id: user.id as string, email: user.email as string, name: user.name as string | null, handle: user.handle as string | null, accounts: accounts.map((account) => account.handle as string) };
}

/** Sign in with Google. People only ever sign in here: there are no passwords to look after. */
export function authRoutes({ sql, clientId, clientSecret, publicUrl, ownerEmail, fetcher = fetch, tables, refresh, pages }: AuthConfig) {
  const app = new Hono();
  const redirectUri = `${publicUrl}/auth/google/callback`;
  const cookie = { httpOnly: true, secure: publicUrl.startsWith("https:"), sameSite: "Lax", path: "/" } as const;

  app.get("/auth/google", (c) => {
    const state = randomBytes(32).toString("base64url");
    setCookie(c, STATE_COOKIE, state, { ...cookie, maxAge: 600 });
    const query = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: "openid email profile", state });
    return c.redirect(`${authorizeUrl}?${query}`);
  });

  app.get("/auth/google/callback", async (c) => {
    const failed = () => c.redirect("/?signin=failed");
    const state = getCookie(c, STATE_COOKIE);
    deleteCookie(c, STATE_COOKIE, cookie);
    const code = c.req.query("code");
    if (!code || !state || c.req.query("state") !== state) return failed();

    const tokens = await fetcher(tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
    });
    if (!tokens.ok) return failed();
    const { access_token: accessToken } = (await tokens.json()) as { access_token: string };
    const response = await fetcher(profileUrl, { headers: { authorization: `Bearer ${accessToken}` } });
    if (!response.ok) return failed();
    const profile = (await response.json()) as { email?: string; email_verified?: boolean; name?: string };
    if (!profile.email || !profile.email_verified) return failed();

    const email = profile.email.toLowerCase();
    const [user] = await sql`
      insert into users (email, name) values (${email}, ${profile.name ?? null})
      on conflict (email) do update set name = coalesce(users.name, excluded.name) returning id, blocked_at`;
    if (user!.blocked_at) return failed();
    await ensureAccount(sql, user!.id as string, email, profile.name ?? null);
    if (ownerEmail && email === ownerEmail.toLowerCase()) {
      await sql`
        insert into account_members (account_id, user_id)
        select id, ${user!.id} from accounts where handle = ${OFFICIAL_ACCOUNT}
        on conflict do nothing`;
    }
    const token = randomBytes(32).toString("base64url");
    await sql`insert into sessions (token_hash, user_id, expires_at) values (${hash(token)}, ${user!.id}, now() + ${`${SESSION_DAYS} days`}::interval)`;
    setCookie(c, SESSION_COOKIE, token, { ...cookie, maxAge: SESSION_DAYS * 86_400 });
    return c.redirect("/");
  });

  app.post("/auth/logout", async (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) await sql`delete from sessions where token_hash = ${hash(token)}`;
    deleteCookie(c, SESSION_COOKIE, cookie);
    return c.redirect("/", 303);
  });

  const signedIn = (c: Context) => currentUser(sql, getCookie(c, SESSION_COOKIE));

  app.get("/api/me", async (c) => {
    const user = await signedIn(c);
    if (!user) return c.json({ canSignIn: true, user: null });
    const { id: _id, ...visible } = user;
    return c.json({ canSignIn: true, user: visible });
  });

  app.get("/api/tables/:owner/:slug/history", async (c) => c.json(await tableHistory(sql, c.req.param("owner"), c.req.param("slug"))));
  app.get("/api/tables/:owner/:slug/proposals", async (c) => c.json(await listProposals(sql, c.req.param("owner"), c.req.param("slug"))));

  app.post("/api/tables/:owner/:slug/proposals", rateLimit(PROPOSALS_PER_MINUTE), async (c) => {
    const user = await signedIn(c);
    if (!user) return c.json({ error: "Sign in to suggest a change." }, 401);
    const body = proposalBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Add a value, a source link and the exact quote." }, 400);
    const owner = c.req.param("owner");
    const result = await submitProposal(sql, tables, { ...body.data, owner, slug: c.req.param("slug") }, user.id, "site", pages);
    if ("error" in result) return c.json(result, 400);
    // Someone running the table doesn't need to review their own edit, and it still passed every check.
    if (runsTable(user, owner)) {
      await decideProposal(sql, result.id, user.id, true);
      await refresh?.();
      return c.json({ ...result, applied: true }, 201);
    }
    return c.json(result, 201);
  });

  for (const [action, accept] of [["accept", true], ["reject", false]] as const) {
    app.post(`/api/proposals/:id/${action}`, async (c) => {
      const user = await signedIn(c);
      if (!user) return c.json({ error: "Sign in first." }, 401);
      if (!(await decideProposal(sql, c.req.param("id"), user.id, accept))) return c.json({ error: "You can't decide this proposal." }, 403);
      await refresh?.();
      return c.json({ ok: true });
    });
  }

  app.get("/api/tokens", async (c) => {
    const user = await signedIn(c);
    return user ? c.json(await listTokens(sql, user.id)) : c.json({ error: "Sign in first." }, 401);
  });

  app.post("/api/tokens", async (c) => {
    const user = await signedIn(c);
    if (!user) return c.json({ error: "Sign in first." }, 401);
    const { name } = ((await c.req.json().catch(() => ({}))) ?? {}) as { name?: unknown };
    if (name !== undefined && typeof name !== "string") return c.json({ error: "A token's name must be text." }, 400);
    return c.json(await createToken(sql, user.id, name?.trim().slice(0, 80) || "Agent"), 201);
  });

  app.delete("/api/tokens/:id", async (c) => {
    const user = await signedIn(c);
    if (!user) return c.json({ error: "Sign in first." }, 401);
    await deleteToken(sql, user.id, c.req.param("id"));
    return c.json({ ok: true });
  });

  accountRoutes(app, sql, tables, signedIn, refresh);

  return app;
}
