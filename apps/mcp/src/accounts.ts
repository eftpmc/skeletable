import { TABLE_FORMAT, validateTable, type Cell, type Table } from "@skeleton/tables/format";
import type { Context, Hono } from "hono";
import { z } from "zod";
import { importTables, type Sql } from "./db.js";
import type { PublishedTable } from "./library.js";
import { rateLimit } from "./rate-limit.js";

type SignedIn = (c: Context) => Promise<{ id: string; accounts: string[] } | null>;

const OFFICIAL_ACCOUNT = "skeletable";
const CREATIONS_PER_MINUTE = 10;
const MAX_ROWS = 200;

// These are the site's own addresses, so no account can take them.
const reserved = new Set(["api", "auth", "mcp", "health", "explore", "settings", "new", "about", "terms", "privacy", "assets", "logo", "robots", "sitemap", "admin", "www", OFFICIAL_ACCOUNT]);

const handlePattern = /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/;

const slugOf = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

const today = () => new Date().toISOString().slice(0, 10);

/** Give a new person their own public account, named after their email. They can rename it in Settings. */
export async function ensureAccount(sql: Sql, userId: string, email: string, name: string | null) {
  const [user] = await sql`select account_id from users where id = ${userId}`;
  if (user?.account_id) return;
  const base = slugOf(email.split("@")[0]!) || "user";
  for (let attempt = 0; attempt < 50; attempt++) {
    const handle = attempt ? `${base}-${attempt + 1}` : base;
    if (reserved.has(handle)) continue;
    const [account] = await sql`insert into accounts (handle, name) values (${handle}, ${name ?? handle}) on conflict (handle) do nothing returning id`;
    if (!account) continue;
    await sql`insert into account_members (account_id, user_id) values (${account.id}, ${userId})`;
    await sql`update users set account_id = ${account.id} where id = ${userId}`;
    return;
  }
  throw new Error(`No free handle for ${base}`);
}

const profileBody = z.object({ name: z.string().trim().min(1).max(80).optional(), handle: z.string().trim().toLowerCase().optional() });

const columnBody = z.object({
  label: z.string().trim().min(1).max(80),
  type: z.enum(["text", "number", "boolean"]),
  unit: z.string().trim().max(30).optional(),
  rule: z.string().trim().min(1).max(500),
});

const tableBody = z.object({
  title: z.string().trim().min(1).max(120),
  question: z.string().trim().min(1).max(300),
  topic: z.string().trim().min(1).max(40),
  scope: z.string().trim().min(1).max(800),
  columns: z.array(columnBody).min(1).max(20),
  rows: z.array(z.string().trim().min(1).max(120)).min(1).max(MAX_ROWS),
});

const emptyCell = (): Cell => ({ missing: true, checked: [], read: today() });

/** A column id that's safe and unique within its table. */
function columnIds(labels: string[]) {
  const used = new Set<string>();
  return labels.map((label) => {
    const base = slugOf(label).replace(/-/g, "_").replace(/^[^a-z]+/, "") || "column";
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}_${n}`;
    used.add(id);
    return id;
  });
}

/** Whether a table's owner has this person in it, for the routes that change a table. */
export const runsTable = (user: { accounts: string[] } | null, owner: string) => !!user?.accounts.includes(owner);

export function accountRoutes(app: Hono, sql: Sql, tables: PublishedTable[], signedIn: SignedIn, refresh?: () => Promise<unknown>) {
  app.patch("/api/me", async (c) => {
    const user = await signedIn(c);
    if (!user) return c.json({ error: "Sign in first." }, 401);
    const body = profileBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Enter a name of up to 80 characters." }, 400);
    const { name, handle } = body.data;
    if (handle !== undefined && (!handlePattern.test(handle) || reserved.has(handle))) {
      return c.json({ error: "Use letters, numbers and dashes, and pick a name that isn't reserved." }, 400);
    }
    const [account] = await sql`select a.id, a.handle from accounts a join users u on u.account_id = a.id where u.id = ${user.id}`;
    if (name !== undefined) {
      await sql`update users set name = ${name} where id = ${user.id}`;
      if (account) await sql`update accounts set name = ${name} where id = ${account.id}`;
    }
    if (handle !== undefined && account && handle !== account.handle) {
      const [taken] = await sql`select 1 from accounts where handle = ${handle}`;
      if (taken) return c.json({ error: "That name is taken." }, 409);
      await sql`update accounts set handle = ${handle} where id = ${account.id}`;
      await refresh?.();
    }
    return c.json({ ok: true });
  });

  // Their tables and sign-ins go. Proposals they made stay, with their name removed.
  app.delete("/api/me", async (c) => {
    const user = await signedIn(c);
    if (!user) return c.json({ error: "Sign in first." }, 401);
    await sql.begin(async (tx) => {
      const [own] = await tx`select account_id from users where id = ${user.id}`;
      await tx`delete from sessions where user_id = ${user.id}`;
      await tx`delete from api_tokens where user_id = ${user.id}`;
      await tx`delete from account_members where user_id = ${user.id}`;
      await tx`update users set email = ${`deleted-${user.id}@deleted.invalid`}, name = null, account_id = null, blocked_at = now() where id = ${user.id}`;
      if (own?.account_id) {
        await tx`delete from data_tables where account_id = ${own.account_id}`;
        await tx`delete from account_members where account_id = ${own.account_id}`;
        await tx`delete from accounts where id = ${own.account_id}`;
      }
    });
    await refresh?.();
    return c.json({ ok: true });
  });

  app.post("/api/tables", rateLimit(CREATIONS_PER_MINUTE), async (c) => {
    const user = await signedIn(c);
    if (!user) return c.json({ error: "Sign in to create a table." }, 401);
    const body = tableBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Fill in every field, with at least one column and one row." }, 400);
    const [account] = await sql`select a.handle from accounts a join users u on u.account_id = a.id where u.id = ${user.id}`;
    if (!account) return c.json({ error: "Your account isn't set up." }, 400);
    const owner = account.handle as string;
    const { title, question, topic, scope, columns, rows } = body.data;
    if (new Set(rows).size !== rows.length) return c.json({ error: "Each row needs its own name." }, 400);

    const base = slugOf(title) || "table";
    let slug = base;
    for (let n = 2; tables.some((t) => t.owner === owner && t.slug === slug); n++) slug = `${base}-${n}`;
    const ids = columnIds(columns.map((column) => column.label));
    const table: Table = {
      format: TABLE_FORMAT,
      owner,
      slug,
      topic,
      title,
      question,
      scope,
      columns: columns.map(({ unit, ...column }, index) => ({ ...column, id: ids[index]!, ...(unit && { unit }) })),
      rows: rows.map((key) => ({ key, cells: Object.fromEntries(ids.map((id) => [id, emptyCell()])) })),
    };
    const { problems } = validateTable(table);
    if (problems.length) return c.json({ error: "That table isn't valid. Check its columns and rows." }, 400);
    await importTables(sql, [table]);
    await refresh?.();
    return c.json({ owner, slug }, 201);
  });

  app.post("/api/tables/:owner/:slug/rows", rateLimit(CREATIONS_PER_MINUTE * 3), async (c) => {
    const user = await signedIn(c);
    const owner = c.req.param("owner");
    if (!runsTable(user, owner)) return c.json({ error: "Only this table's owner can add rows." }, 403);
    const table = tables.find((t) => t.owner === owner && t.slug === c.req.param("slug"));
    const key = z.object({ key: z.string().trim().min(1).max(120) }).safeParse(await c.req.json().catch(() => null));
    if (!table || !key.success) return c.json({ error: "Enter a name for the row." }, 400);
    if (table.rows.some((row) => row.key === key.data.key)) return c.json({ error: "That row already exists." }, 409);
    if (table.rows.length >= MAX_ROWS) return c.json({ error: "This table has reached its row limit." }, 400);
    await sql.begin(async (tx) => {
      const [saved] = await tx`
        insert into table_rows (table_id, key, position)
        select t.id, ${key.data.key}, coalesce((select max(position) + 1 from table_rows r where r.table_id = t.id), 0)
        from data_tables t join accounts a on a.id = t.account_id where a.handle = ${owner} and t.slug = ${table.slug}
        returning id`;
      for (const column of table.columns) {
        await tx`insert into cell_versions (row_id, column_id, cell) values (${saved!.id}, ${column.id}, ${tx.json(emptyCell())})`;
      }
    });
    await refresh?.();
    return c.json({ ok: true }, 201);
  });

  /** Open proposals waiting on this person, across every table they run. */
  app.get("/api/inbox", async (c) => {
    const user = await signedIn(c);
    if (!user) return c.json({ error: "Sign in first." }, 401);
    return c.json(await sql`
      select p.id, a.handle as owner, t.slug, t.title, r.key as row, p.column_id as column, p.created_at
      from proposals p
      join data_tables t on t.id = p.table_id
      join accounts a on a.id = t.account_id
      join account_members m on m.account_id = a.id
      join table_rows r on r.id = p.row_id
      where m.user_id = ${user.id} and p.status = 'open'
      order by p.id desc limit 50`);
  });

  // Blocking is for the people who run the official account: it stops someone across the whole site.
  app.post("/api/proposals/:id/block", async (c) => {
    const user = await signedIn(c);
    if (!runsTable(user, OFFICIAL_ACCOUNT)) return c.json({ error: "You can't block people." }, 403);
    const [proposal] = await sql`select created_by from proposals where id = ${c.req.param("id")}`;
    if (!proposal) return c.notFound();
    if (proposal.created_by === user!.id) return c.json({ error: "You can't block yourself." }, 400);
    await sql`update users set blocked_at = now() where id = ${proposal.created_by}`;
    await sql`update proposals set status = 'rejected', decided_by = ${user!.id}, decided_at = now() where created_by = ${proposal.created_by} and status = 'open'`;
    await sql`delete from sessions where user_id = ${proposal.created_by}`;
    await sql`delete from api_tokens where user_id = ${proposal.created_by}`;
    return c.json({ ok: true });
  });
}
