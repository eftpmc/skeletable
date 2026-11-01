import type { Hono } from "hono";
import { z } from "zod";
import { CREATIONS_PER_MINUTE, bioSchema, createAccount, isOwner, slugOf, type SignedIn } from "./accounts.js";
import { OFFICIAL_ACCOUNT, type Sql } from "./db.js";
import type { Mailer } from "./email.js";
import { rateLimit } from "./rate-limit.js";

const roleSchema = z.enum(["owner", "editor"]);
const nameBody = z.object({ name: z.string().trim().min(1).max(80) });
const teamBody = nameBody.extend({ bio: bioSchema.optional() });
const inviteBody = z.object({ email: z.string().trim().toLowerCase().email().max(254), role: roleSchema.default("editor") });

type Options = { mail?: Mailer; publicUrl: string; refresh?: () => Promise<unknown> };

/** Whether taking this person out of the owners would leave the team with none. */
async function lastOwner(sql: Sql, handle: string, userId: string) {
  const owners = await sql`
    select m.user_id from account_members m join accounts a on a.id = m.account_id
    where a.handle = ${handle} and m.role = 'owner'`;
  return owners.length === 1 && owners[0]!.user_id === userId;
}

/**
 * Teams are accounts several people run. An invite is held against a Google-verified email, so
 * it needs no secret link and no mail to work: whoever signs in with that address sees it.
 */
export function teamRoutes(app: Hono, sql: Sql, signedIn: SignedIn, { mail, publicUrl, refresh }: Options) {
  app.post("/api/teams", rateLimit(CREATIONS_PER_MINUTE), async (c) => {
    const user = await signedIn(c);
    if (!user) return c.json({ error: "Sign in to create a team." }, 401);
    const body = nameBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Enter a name of up to 80 characters." }, 400);
    const { handle } = await createAccount(sql, slugOf(body.data.name).slice(0, 39).replace(/-$/, "") || "team", body.data.name, user.id, true);
    return c.json({ handle }, 201);
  });

  app.get("/api/teams/:handle", async (c) => {
    const user = await signedIn(c);
    const handle = c.req.param("handle");
    const [team] = await sql`select id, name, bio from accounts where handle = ${handle} and team`;
    // Someone outside a team gets the same answer as for a team that doesn't exist.
    if (!team || !user?.accounts.includes(handle)) return c.json({ error: "No such team" }, 404);
    const members = await sql`
      select u.id, u.name, u.email, m.role from account_members m join users u on u.id = m.user_id
      where m.account_id = ${team.id} order by m.role desc, u.name, u.id`;
    const owner = await isOwner(sql, user.id, handle);
    const invites = owner ? await sql`select id, email, role from team_invites where account_id = ${team.id} order by id` : [];
    return c.json({ handle, name: team.name, bio: team.bio, role: owner ? "owner" : "editor", you: user.id, members, invites });
  });

  app.patch("/api/teams/:handle", async (c) => {
    const user = await signedIn(c);
    const handle = c.req.param("handle");
    if (!user || !(await isOwner(sql, user.id, handle))) return c.json({ error: "Only a team's owners can do that." }, 403);
    const body = teamBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Enter a name of up to 80 characters and a description of up to 160." }, 400);
    await sql`update accounts set name = ${body.data.name}, bio = coalesce(${body.data.bio ?? null}, bio) where handle = ${handle} and team`;
    await refresh?.();
    return c.json({ ok: true });
  });

  app.delete("/api/teams/:handle", async (c) => {
    const user = await signedIn(c);
    const handle = c.req.param("handle");
    if (handle === OFFICIAL_ACCOUNT) return c.json({ error: "This team can't be deleted." }, 403);
    if (!user || !(await isOwner(sql, user.id, handle))) return c.json({ error: "Only a team's owners can do that." }, 403);
    await sql.begin(async (tx) => {
      const [team] = await tx`select id from accounts where handle = ${handle} and team`;
      if (!team) return;
      await tx`delete from data_tables where account_id = ${team.id}`;
      await tx`delete from account_members where account_id = ${team.id}`;
      await tx`delete from accounts where id = ${team.id}`;
    });
    await refresh?.();
    return c.json({ ok: true });
  });

  app.post("/api/teams/:handle/invites", rateLimit(CREATIONS_PER_MINUTE), async (c) => {
    const user = await signedIn(c);
    const handle = c.req.param("handle");
    if (!user || !(await isOwner(sql, user.id, handle))) return c.json({ error: "Only a team's owners can do that." }, 403);
    const body = inviteBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Enter an email address." }, 400);
    const { email, role } = body.data;
    const [team] = await sql`select id, name from accounts where handle = ${handle} and team`;
    if (!team) return c.notFound();
    const [member] = await sql`select 1 from account_members m join users u on u.id = m.user_id where m.account_id = ${team.id} and u.email = ${email}`;
    if (member) return c.json({ error: "They're already on this team." }, 409);
    await sql`insert into team_invites (account_id, email, role) values (${team.id}, ${email}, ${role}) on conflict (account_id, email) do update set role = excluded.role`;
    // The invite works without this, so a failed email doesn't fail it.
    await mail?.(email, `Join ${team.name as string} on Skeletable`, `You've been invited to ${team.name as string}. Sign in with this address to accept: ${publicUrl}/settings/teams`).catch((error: unknown) => console.error(`Couldn't send a team invite: ${error}`));
    return c.json({ ok: true }, 201);
  });

  app.delete("/api/teams/:handle/invites/:id", async (c) => {
    const user = await signedIn(c);
    const handle = c.req.param("handle");
    if (!user || !(await isOwner(sql, user.id, handle))) return c.json({ error: "Only a team's owners can do that." }, 403);
    await sql`delete from team_invites i using accounts a where i.id = ${c.req.param("id")} and a.id = i.account_id and a.handle = ${handle}`;
    return c.json({ ok: true });
  });

  app.patch("/api/teams/:handle/members/:id", async (c) => {
    const user = await signedIn(c);
    const [handle, id] = [c.req.param("handle"), c.req.param("id")];
    if (!user || !(await isOwner(sql, user.id, handle))) return c.json({ error: "Only a team's owners can do that." }, 403);
    const role = roleSchema.safeParse(((await c.req.json().catch(() => null)) as { role?: unknown } | null)?.role);
    if (!role.success) return c.json({ error: "Pick a role." }, 400);
    if (role.data === "editor" && (await lastOwner(sql, handle, id))) return c.json({ error: "A team needs at least one owner." }, 400);
    await sql`update account_members m set role = ${role.data} from accounts a where a.id = m.account_id and a.handle = ${handle} and m.user_id = ${id}`;
    return c.json({ ok: true });
  });

  // Owners can remove anyone, and anyone can leave.
  app.delete("/api/teams/:handle/members/:id", async (c) => {
    const user = await signedIn(c);
    const [handle, id] = [c.req.param("handle"), c.req.param("id")];
    if (!user || (user.id !== id && !(await isOwner(sql, user.id, handle)))) return c.json({ error: "Only a team's owners can do that." }, 403);
    if (await lastOwner(sql, handle, id)) return c.json({ error: "A team needs at least one owner." }, 400);
    await sql`delete from account_members m using accounts a where a.id = m.account_id and a.team and a.handle = ${handle} and m.user_id = ${id}`;
    return c.json({ ok: true });
  });

  app.get("/api/invites", async (c) => {
    const user = await signedIn(c);
    if (!user) return c.json({ error: "Sign in first." }, 401);
    return c.json(await sql`
      select i.id, a.handle, a.name, i.role from team_invites i join accounts a on a.id = i.account_id
      where i.email = ${user.email} order by i.id`);
  });

  app.post("/api/invites/:id/accept", async (c) => {
    const user = await signedIn(c);
    if (!user) return c.json({ error: "Sign in first." }, 401);
    const joined = await sql.begin(async (tx) => {
      const [invite] = await tx`delete from team_invites where id = ${c.req.param("id")} and email = ${user.email} returning account_id, role`;
      if (!invite) return false;
      await tx`insert into account_members (account_id, user_id, role) values (${invite.account_id}, ${user.id}, ${invite.role}) on conflict do nothing`;
      return true;
    });
    return joined ? c.json({ ok: true }) : c.json({ error: "That invite isn't there any more." }, 404);
  });

  app.post("/api/invites/:id/decline", async (c) => {
    const user = await signedIn(c);
    if (!user) return c.json({ error: "Sign in first." }, 401);
    await sql`delete from team_invites where id = ${c.req.param("id")} and email = ${user.email}`;
    return c.json({ ok: true });
  });
}
