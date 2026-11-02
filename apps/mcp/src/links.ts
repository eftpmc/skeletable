import { randomBytes } from "node:crypto";
import type { Hono } from "hono";
import { runsTable, type SignedIn } from "./accounts.js";
import type { Sql } from "./db.js";
import type { PublishedTable } from "./library.js";

/**
 * A private table's data link: an address with a secret in it, so a notebook, a script or a
 * spreadsheet can load the table without signing in. Anyone holding the link can read the table's
 * data, so only its people make one, and a new one stops the old one working.
 */

const keyPattern = /^[A-Za-z0-9_-]{24}$/;

const tableId = async (sql: Sql, table: { owner: string; slug: string }) => {
  const [row] = await sql`select t.id, t.data_key from data_tables t join accounts a on a.id = t.account_id where a.handle = ${table.owner} and t.slug = ${table.slug}`;
  return row as { id: string; data_key: string | null } | undefined;
};

export const dataLinkUrl = (publicUrl: string, key: string) => `${publicUrl}/d/${key}.csv`;

/** The table's data key, made now if it has none. `fresh` replaces the one it has. */
export async function dataKey(sql: Sql, table: { owner: string; slug: string }, fresh = false) {
  const row = await tableId(sql, table);
  if (!row) return undefined;
  if (row.data_key && !fresh) return row.data_key;
  const key = randomBytes(18).toString("base64url");
  await sql`update data_tables set data_key = ${key} where id = ${row.id}`;
  return key;
}

/** The table a data key opens, if any still does. */
export async function tableForKey(sql: Sql, tables: PublishedTable[], key: string) {
  if (!keyPattern.test(key)) return undefined;
  const [row] = await sql`select a.handle as owner, t.slug from data_tables t join accounts a on a.id = t.account_id where t.data_key = ${key}`;
  return row ? tables.find((table) => table.owner === row.owner && table.slug === row.slug) : undefined;
}

/** Ready-made lines for the places people load data. */
export const loadSnippets = (url: string) => ({ pandas: `pd.read_csv("${url}")`, sheets: `=IMPORTDATA("${url}")` });

export function dataLinkRoutes(app: Hono, sql: Sql, tables: PublishedTable[], signedIn: SignedIn, publicUrl: string) {
  const running = async (c: Parameters<SignedIn>[0]) => {
    const user = await signedIn(c);
    const [owner, slug] = [c.req.param("owner")!, c.req.param("slug")!];
    if (!runsTable(user, owner)) return undefined;
    return tables.find((table) => table.owner === owner && table.slug === slug);
  };
  const refused = { error: "Only the people running this table can manage its data link." };
  const answer = (key: string | null | undefined) => (key ? { url: dataLinkUrl(publicUrl, key), ...loadSnippets(dataLinkUrl(publicUrl, key)) } : { url: null });

  app.get("/api/tables/:owner/:slug/data-link", async (c) => {
    const table = await running(c);
    if (!table) return c.json(refused, 403);
    return c.json(answer((await tableId(sql, table))?.data_key));
  });

  // Makes the link, or with `fresh` replaces it so the old one stops working.
  app.post("/api/tables/:owner/:slug/data-link", async (c) => {
    const table = await running(c);
    if (!table) return c.json(refused, 403);
    const body = (await c.req.json().catch(() => ({}))) as { fresh?: unknown };
    return c.json(answer(await dataKey(sql, table, body.fresh === true)));
  });

  app.delete("/api/tables/:owner/:slug/data-link", async (c) => {
    const table = await running(c);
    if (!table) return c.json(refused, 403);
    await sql`update data_tables t set data_key = null from accounts a where a.id = t.account_id and a.handle = ${table.owner} and t.slug = ${table.slug}`;
    return c.json({ url: null });
  });
}
