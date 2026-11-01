import { createHash, randomBytes } from "node:crypto";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Sql } from "./db.js";

export type AuthConfig = {
  sql: Sql;
  clientId: string;
  clientSecret: string;
  publicUrl: string;
  // Whoever signs in with this email runs the official account.
  ownerEmail?: string;
  fetcher?: typeof fetch;
};

const OFFICIAL_ACCOUNT = "skeletable";
const SESSION_COOKIE = "session";
const STATE_COOKIE = "auth_state";
const SESSION_DAYS = 30;

const authorizeUrl = "https://accounts.google.com/o/oauth2/v2/auth";
const tokenUrl = "https://oauth2.googleapis.com/token";
const profileUrl = "https://openidconnect.googleapis.com/v1/userinfo";

// A stolen copy of the sessions table can't be used to sign in, because only the hash is kept.
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** Who a session cookie belongs to, and the accounts they can act as. */
export async function currentUser(sql: Sql, token: string | undefined) {
  if (!token) return null;
  const [user] = await sql`
    select u.id, u.email, u.name from sessions s join users u on u.id = s.user_id
    where s.token_hash = ${hash(token)} and s.expires_at > now()`;
  if (!user) return null;
  const accounts = await sql`
    select a.handle from account_members m join accounts a on a.id = m.account_id where m.user_id = ${user.id} order by a.handle`;
  return { email: user.email as string, name: user.name as string | null, accounts: accounts.map((account) => account.handle as string) };
}

/** Sign in with Google. People only ever sign in here: there are no passwords to look after. */
export function authRoutes({ sql, clientId, clientSecret, publicUrl, ownerEmail, fetcher = fetch }: AuthConfig) {
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
      on conflict (email) do update set name = excluded.name returning id`;
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

  app.get("/api/me", async (c) => c.json({ canSignIn: true, user: await currentUser(sql, getCookie(c, SESSION_COOKIE)) }));

  return app;
}
