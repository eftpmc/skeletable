import type { Hono } from "hono";
import { z } from "zod";
import { CREATIONS_PER_MINUTE, isOwner, type SignedIn } from "./accounts.js";
import type { Sql } from "./db.js";
import type { Mailer } from "./email.js";
import type { PublishedTable } from "./library.js";
import { rateLimit } from "./rate-limit.js";

/** Who's asking: the accounts they're in, and the private tables shared with their address. */
export type Viewer = { accounts: string[]; shared: string[] };

export const everyone: Viewer = { accounts: [], shared: [] };

const tableKey = (table: { owner: string; slug: string }) => `${table.owner}/${table.slug}`;

/** The one rule for reading a table. Every way of reading one goes through this or `readable`. */
export const canRead = (table: PublishedTable, viewer: Viewer) =>
  !table.private || viewer.accounts.includes(table.owner) || viewer.shared.includes(tableKey(table));

export const readable = (tables: PublishedTable[], viewer: Viewer) => tables.filter((table) => canRead(table, viewer));

/** The tables this address has been given, read fresh so a removal takes effect at once. */
export async function sharedWith(sql: Sql, email: string) {
  const shared = await sql`
    select a.handle as owner, t.slug from table_access x
    join data_tables t on t.id = x.table_id join accounts a on a.id = t.account_id
    where x.email = ${email}`;
  return shared.map((table) => tableKey(table as unknown as { owner: string; slug: string }));
}

/** The same view of a person, for an agent acting with their token. */
export async function viewerFor(sql: Sql, userId: string): Promise<Viewer> {
  const [user] = await sql`select email from users where id = ${userId}`;
  const accounts = await sql`select a.handle from account_members m join accounts a on a.id = m.account_id where m.user_id = ${userId}`;
  return { accounts: accounts.map((account) => account.handle as string), shared: await sharedWith(sql, user!.email as string) };
}

const emailBody = z.object({ email: z.string().trim().toLowerCase().email().max(254) });
const visibilityBody = z.object({ private: z.boolean() });

type Options = { tables: PublishedTable[]; mail?: Mailer; publicUrl: string; refresh?: () => Promise<unknown> };

/** Who can see a table. This belongs to the owners of its account, not its editors. */
export function accessRoutes(app: Hono, sql: Sql, signedIn: SignedIn, { tables, mail, publicUrl, refresh }: Options) {
  const managed = async (owner: string, slug: string, userId?: string) => {
    if (!userId || !(await isOwner(sql, userId, owner))) return undefined;
    const [row] = await sql`select t.id from data_tables t join accounts a on a.id = t.account_id where a.handle = ${owner} and t.slug = ${slug}`;
    return row?.id as string | undefined;
  };
  const refused = { error: "Only this table's owners can do that." };

  app.get("/api/tables/:owner/:slug/access", async (c) => {
    const user = await signedIn(c);
    const id = await managed(c.req.param("owner"), c.req.param("slug"), user?.id);
    if (!id) return c.json(refused, 403);
    const [table] = await sql`select private from data_tables where id = ${id}`;
    return c.json({ private: table!.private as boolean, people: await sql`select id, email from table_access where table_id = ${id} order by email` });
  });

  app.patch("/api/tables/:owner/:slug/access", async (c) => {
    const user = await signedIn(c);
    const [owner, slug] = [c.req.param("owner"), c.req.param("slug")];
    const id = await managed(owner, slug, user?.id);
    if (!id) return c.json(refused, 403);
    const body = visibilityBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Choose public or private." }, 400);
    await sql`update data_tables set private = ${body.data.private} where id = ${id}`;
    // Hidden straight away here, in case the full refresh below can't finish.
    const held = tables.find((table) => table.owner === owner && table.slug === slug);
    if (held) held.private = body.data.private;
    await refresh?.();
    return c.json({ ok: true });
  });

  app.post("/api/tables/:owner/:slug/people", rateLimit(CREATIONS_PER_MINUTE), async (c) => {
    const user = await signedIn(c);
    const [owner, slug] = [c.req.param("owner"), c.req.param("slug")];
    const id = await managed(owner, slug, user?.id);
    if (!id) return c.json(refused, 403);
    const body = emailBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Enter an email address." }, 400);
    await sql`insert into table_access (table_id, email) values (${id}, ${body.data.email}) on conflict do nothing`;
    const title = tables.find((table) => table.owner === owner && table.slug === slug)?.title ?? slug;
    await mail?.(body.data.email, `A table was shared with you: ${title}`, `Sign in with this address to open it: ${publicUrl}/${owner}/${slug}`).catch((error: unknown) => console.error(`Couldn't send a share notice: ${error}`));
    return c.json({ ok: true }, 201);
  });

  app.delete("/api/tables/:owner/:slug/people/:id", async (c) => {
    const user = await signedIn(c);
    const id = await managed(c.req.param("owner"), c.req.param("slug"), user?.id);
    if (!id) return c.json(refused, 403);
    await sql`delete from table_access where id = ${c.req.param("id")} and table_id = ${id}`;
    return c.json({ ok: true });
  });
}
