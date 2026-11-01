import { TABLE_FORMAT, validateTable, type Cell, type Table } from "@skeleton/tables/format";
import type { Context, Hono } from "hono";
import { z } from "zod";
import { everyone, readable } from "./access.js";
import { OFFICIAL_ACCOUNT, importTables, type Sql, type TransactionSql } from "./db.js";
import type { PublishedTable } from "./library.js";
import { rateLimit } from "./rate-limit.js";

export type SignedIn = (c: Context) => Promise<{ id: string; email: string; accounts: string[]; shared: string[] } | null>;

export const CREATIONS_PER_MINUTE = 10;
export const MAX_ROWS = 200;
export const MAX_COLUMNS = 20;

// These are the site's own addresses, so no account can take them.
const reserved = new Set(["api", "auth", "mcp", "health", "explore", "settings", "new", "about", "accuracy", "blog", "data", "embed", "developers", "help", "llms", "terms", "privacy", "assets", "logo", "og", "robots", "sitemap", "admin", "www", OFFICIAL_ACCOUNT]);

const handlePattern = /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/;

export const slugOf = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

const today = () => new Date().toISOString().slice(0, 10);

/** Make an account at the first free address near `base`, with this person running it. */
export async function createAccount(sql: Sql, base: string, name: string | null, userId: string, team: boolean) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const handle = attempt ? `${base}-${attempt + 1}` : base;
    if (reserved.has(handle)) continue;
    const [account] = await sql`insert into accounts (handle, name, team) values (${handle}, ${name ?? handle}, ${team}) on conflict (handle) do nothing returning id`;
    if (!account) continue;
    await sql`insert into account_members (account_id, user_id) values (${account.id}, ${userId})`;
    return { id: account.id as string, handle };
  }
  throw new Error(`No free handle for ${base}`);
}

/** Give a new person their own public account, named after their email. They can rename it in Settings. */
export async function ensureAccount(sql: Sql, userId: string, email: string, name: string | null) {
  const [user] = await sql`select account_id from users where id = ${userId}`;
  if (user?.account_id) return;
  const account = await createAccount(sql, slugOf(email.split("@")[0]!) || "user", name, userId, false);
  await sql`update users set account_id = ${account.id} where id = ${userId}`;
}

/** Whether this person is an owner of an account, which is what managing it takes. */
export async function isOwner(sql: Sql, userId: string, handle: string) {
  const [member] = await sql`
    select 1 from account_members m join accounts a on a.id = m.account_id
    where m.user_id = ${userId} and a.handle = ${handle} and m.role = 'owner'`;
  return !!member;
}

export const bioSchema = z.string().trim().max(160);

const profileBody = z.object({ name: z.string().trim().min(1).max(80).optional(), handle: z.string().trim().toLowerCase().optional(), bio: bioSchema.optional(), emailUpdates: z.boolean().optional() });

export const columnBody = z.object({
  label: z.string().trim().min(1).max(80),
  type: z.enum(["text", "number", "boolean"]),
  unit: z.string().trim().max(30).optional(),
  rule: z.string().trim().max(500).default(""),
});

export const tableBody = z.object({
  owner: z.string().trim().optional(),
  private: z.boolean().default(false),
  draft: z.boolean().default(false),
  title: z.string().trim().min(1).max(120),
  question: z.string().trim().max(300).default(""),
  topic: z.string().trim().max(40).default(""),
  scope: z.string().trim().max(800).default(""),
  columns: z.array(columnBody).min(1).max(MAX_COLUMNS),
  rows: z.array(z.string().trim().min(1).max(120)).min(1).max(MAX_ROWS),
});

type NewTable = z.infer<typeof tableBody>;

/** Why a table can't be made yet. Only a draft can leave its details for later. */
const unfinished = ({ draft, question, topic, scope, columns }: NewTable) => !draft && (!question || !topic || !scope || columns.some((column) => !column.rule));

const UNTITLED = "Untitled table";

/** The first free address near a title. A table can keep the one it has. */
export function freeSlug(tables: PublishedTable[], owner: string, title: string, own?: string) {
  const base = slugOf(title) || "table";
  let slug = base;
  for (let n = 2; slug !== own && tables.some((t) => t.owner === owner && t.slug === slug); n++) slug = `${base}-${n}`;
  return slug;
}

/** Make a table for this owner, at the first free address near its title. */
export async function createTable(sql: Sql, tables: PublishedTable[], owner: string, body: Omit<NewTable, "columns" | "rows"> & { columns: NewTable["columns"]; rows: string[] }) {
  const slug = freeSlug(tables, owner, body.title);
  const ids = columnIds(body.columns.map((column) => column.label));
  const { title, question, topic, scope, columns, rows, draft } = body;
  const table: Table = {
    format: TABLE_FORMAT,
    owner,
    slug,
    ...(draft && { draft }),
    topic,
    title,
    question,
    scope,
    columns: columns.map(({ unit, ...column }, index) => ({ ...column, id: ids[index]!, ...(unit && { unit }) })),
    rows: rows.map((key) => ({ key, cells: Object.fromEntries(ids.map((id) => [id, emptyCell()])) })),
  };
  const { problems } = validateTable(table);
  if (problems.length) return undefined;
  // A draft is private until someone publishes it.
  await importTables(sql, [{ ...table, private: draft || body.private }]);
  return { owner, slug, columns: table.columns.map(({ id, label }) => ({ id, label })) };
}

export const emptyCell = (): Cell => ({ missing: true, checked: [], read: today() });

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

/** Add a column to a table, with every row blank in it. A removed column keeps its id, so its old versions can't be mistaken for this one's. */
export async function addColumn(tx: Sql | TransactionSql, tableId: string, { label, type, unit, rule }: { label: string; type: string; unit?: string; rule: string }) {
  const used = new Set((await tx`select id from table_columns where table_id = ${tableId}`).map((column) => column.id as string));
  const base = slugOf(label).replace(/-/g, "_").replace(/^[^a-z]+/, "") || "column";
  let columnId = base;
  for (let n = 2; used.has(columnId); n++) columnId = `${base}_${n}`;
  await tx`
    insert into table_columns (table_id, id, position, label, type, unit, rule)
    select ${tableId}, ${columnId}, coalesce(max(position) + 1, 0), ${label}, ${type}, ${unit || null}, ${rule} from table_columns where table_id = ${tableId}`;
  const rows = await tx`select id from table_rows where table_id = ${tableId} and removed_at is null`;
  for (const row of rows) await tx`insert into cell_versions (row_id, column_id, cell) values (${row.id}, ${columnId}, ${tx.json(emptyCell())})`;
  return columnId;
}

/** Add a row. A removed row of this name comes back with its old values. */
export const addRow = (sql: Sql, table: PublishedTable, key: string) =>
  sql.begin(async (tx) => {
    const [saved] = await tx`
      insert into table_rows (table_id, key, position)
      select t.id, ${key}, coalesce((select max(position) + 1 from table_rows r where r.table_id = t.id), 0)
      from data_tables t join accounts a on a.id = t.account_id where a.handle = ${table.owner} and t.slug = ${table.slug}
      on conflict (table_id, key) do update set removed_at = null
      returning id`;
    const held = new Set((await tx`select distinct column_id from cell_versions where row_id = ${saved!.id}`).map((cell) => cell.column_id as string));
    for (const column of table.columns) {
      if (!held.has(column.id)) await tx`insert into cell_versions (row_id, column_id, cell) values (${saved!.id}, ${column.id}, ${tx.json(emptyCell())})`;
    }
  });

/** Whether a table's owner has this person in it, for the routes that change a table. */
export const runsTable = (user: { accounts: string[] } | null, owner: string) => !!user?.accounts.includes(owner);

export function accountRoutes(app: Hono, sql: Sql, tables: PublishedTable[], signedIn: SignedIn, refresh?: () => Promise<unknown>) {
  // What an account's page shows. An account with nothing to show only exists to the people in it.
  app.get("/api/accounts/:handle", async (c) => {
    const handle = c.req.param("handle");
    const viewer = (await signedIn(c)) ?? everyone;
    const [account] = await sql`
      select a.name, a.team, a.bio, (select count(*)::int from account_members m where m.account_id = a.id) as members
      from accounts a where a.handle = ${handle}`;
    const shown = viewer.accounts.includes(handle) || readable(tables, viewer).some((table) => table.owner === handle);
    if (!account || !shown) return c.json({ error: "No such account" }, 404);
    return c.json({ handle, team: account.team, bio: account.bio, ...(account.team && { name: account.name, members: account.members }) });
  });

  app.get("/api/me/profile", async (c) => {
    const user = await signedIn(c);
    if (!user) return c.json({ error: "Sign in first." }, 401);
    const [account] = await sql`select a.bio from accounts a join users u on u.account_id = a.id where u.id = ${user.id}`;
    return c.json({ bio: (account?.bio as string | undefined) ?? "" });
  });

  app.patch("/api/me", async (c) => {
    const user = await signedIn(c);
    if (!user) return c.json({ error: "Sign in first." }, 401);
    const body = profileBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Enter a name of up to 80 characters." }, 400);
    const { name, handle, bio, emailUpdates } = body.data;
    if (handle !== undefined && (!handlePattern.test(handle) || reserved.has(handle))) {
      return c.json({ error: "Use letters, numbers and dashes, and pick a name that isn't reserved." }, 400);
    }
    const [account] = await sql`select a.id, a.handle from accounts a join users u on u.account_id = a.id where u.id = ${user.id}`;
    if (emailUpdates !== undefined) await sql`update users set email_updates = ${emailUpdates} where id = ${user.id}`;
    if (bio !== undefined && account) await sql`update accounts set bio = ${bio} where id = ${account.id}`;
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
    // A team can't be left with nobody to run it.
    const stranded = await sql`
      select a.name from account_members m join accounts a on a.id = m.account_id
      where m.user_id = ${user.id} and a.team and m.role = 'owner'
        and not exists (select 1 from account_members other where other.account_id = a.id and other.role = 'owner' and other.user_id <> ${user.id})`;
    if (stranded.length) return c.json({ error: `Hand over or delete ${stranded.map((team) => team.name as string).join(", ")} first.` }, 409);
    await sql.begin(async (tx) => {
      const [own] = await tx`select account_id from users where id = ${user.id}`;
      await tx`delete from team_invites where email = ${user.email}`;
      await tx`delete from table_access where email = ${user.email}`;
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

  // A blank sheet to type into. An untouched one is reused, so opening New table twice doesn't leave a trail of them.
  app.post("/api/tables/blank", rateLimit(CREATIONS_PER_MINUTE), async (c) => {
    const user = await signedIn(c);
    if (!user) return c.json({ error: "Sign in to create a table." }, 401);
    const [account] = await sql`select a.handle from accounts a join users u on u.account_id = a.id where u.id = ${user.id}`;
    if (!account) return c.json({ error: "Your account isn't set up." }, 400);
    const owner = account.handle as string;
    const untouched = tables.find((t) => t.owner === owner && t.draft && t.title === UNTITLED && !t.rows.length && !t.columns.length);
    if (untouched) return c.json({ owner, slug: untouched.slug });
    const created = await createTable(sql, tables, owner, { title: UNTITLED, draft: true, private: true, question: "", topic: "", scope: "", columns: [], rows: [] });
    await refresh?.();
    return c.json(created, 201);
  });

  app.post("/api/tables", rateLimit(CREATIONS_PER_MINUTE), async (c) => {
    const user = await signedIn(c);
    if (!user) return c.json({ error: "Sign in to create a table." }, 401);
    const body = tableBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success || unfinished(body.data)) return c.json({ error: "Fill in every field, with at least one column and one row." }, 400);
    const [account] = await sql`select a.handle from accounts a join users u on u.account_id = a.id where u.id = ${user.id}`;
    if (!account) return c.json({ error: "Your account isn't set up." }, 400);
    const owner = body.data.owner ?? (account.handle as string);
    if (!runsTable(user, owner)) return c.json({ error: "You can't add tables to that account." }, 403);
    if (new Set(body.data.rows).size !== body.data.rows.length) return c.json({ error: "Each row needs its own name." }, 400);
    const created = await createTable(sql, tables, owner, body.data);
    if (!created) return c.json({ error: "That table isn't valid. Check its columns and rows." }, 400);
    await refresh?.();
    return c.json({ owner: created.owner, slug: created.slug }, 201);
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
    await addRow(sql, table, key.data.key);
    await refresh?.();
    return c.json({ ok: true }, 201);
  });

  /** Open proposals waiting on this person, across every table they run. */
  app.get("/api/inbox", async (c) => {
    const user = await signedIn(c);
    if (!user) return c.json({ error: "Sign in first." }, 401);
    return c.json(await sql`
      select * from (select distinct on (coalesce(p.bundle_id, p.id::text)) p.id, p.title as proposal_title, a.handle as owner, t.slug, t.title, r.key as row, p.column_id as column, p.created_at
      from proposals p
      join data_tables t on t.id = p.table_id
      join accounts a on a.id = t.account_id
      join account_members m on m.account_id = a.id
      join table_rows r on r.id = p.row_id
      where m.user_id = ${user.id} and p.status = 'open'
      order by coalesce(p.bundle_id, p.id::text), p.id desc) waiting order by id desc limit 50`);
  });

  // How the site is being found, for the official account's owners. Counts only.
  app.get("/api/stats", async (c) => {
    const user = await signedIn(c);
    if (!user || !(await isOwner(sql, user.id, OFFICIAL_ACCOUNT))) return c.json({ error: "Only the official account's owners can see this." }, 403);
    return c.json(await sql`select name, sum(count)::int as count from daily_counts where day > current_date - 30 group by name order by count desc`);
  });

  // Blocking is for the official account's owners: it stops someone across the whole site.
  app.post("/api/proposals/:id/block", async (c) => {
    const user = await signedIn(c);
    if (!user || !(await isOwner(sql, user.id, OFFICIAL_ACCOUNT))) return c.json({ error: "You can't block people." }, 403);
    const [proposal] = await sql`select created_by from proposals where id = ${c.req.param("id")}`;
    if (!proposal) return c.notFound();
    if (proposal.created_by === user.id) return c.json({ error: "You can't block yourself." }, 400);
    await sql`update users set blocked_at = now() where id = ${proposal.created_by}`;
    await sql`update proposals set status = 'rejected', decided_by = ${user.id}, decided_at = now() where created_by = ${proposal.created_by} and status = 'open'`;
    await sql`delete from sessions where user_id = ${proposal.created_by}`;
    await sql`delete from api_tokens where user_id = ${proposal.created_by}`;
    return c.json({ ok: true });
  });
}
