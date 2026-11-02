import { TABLE_FORMAT, validateTable, type Cell, type Table } from "@skeleton/tables/format";
import type { Hono } from "hono";
import { z } from "zod";
import { CREATIONS_PER_MINUTE, freeSlug, runsTable, type SignedIn } from "./accounts.js";
import { canRead, type Viewer } from "./access.js";
import { importTables, type Sql } from "./db.js";
import type { PublishedTable } from "./library.js";
import { rateLimit } from "./rate-limit.js";

/**
 * A fork: your own copy of a table, to add to, relabel or extend. It starts as a private draft with
 * every value and its proof or origin as it was, and it remembers where it came from.
 */

const forkBody = z.object({ owner: z.string().trim().max(60).optional(), title: z.string().trim().min(1).max(120).optional() });

/** Whether a person may copy this table: anything published and public, or anything they run. */
export const canFork = (table: PublishedTable, viewer: Viewer) => canRead(table, viewer) && ((!table.private && !table.draft) || viewer.accounts.includes(table.owner));

export async function forkTable(sql: Sql, tables: PublishedTable[], source: PublishedTable, owner: string, title?: string) {
  const name = title ?? source.title;
  const slug = freeSlug(tables, owner, name);
  // A value with no proof yet stays behind, as it would on publishing.
  const cells = (row: Table["rows"][number]) => Object.fromEntries(Object.entries(row.cells).map(([id, cell]): [string, Cell] => {
    if (!("missing" in cell) || cell.unproven === undefined) return [id, cell];
    const { unproven: _left, ...rest } = cell;
    return [id, rest];
  }));
  const table: Table = {
    format: TABLE_FORMAT,
    owner,
    slug,
    draft: true,
    ...(source.proof && { proof: source.proof }),
    topic: source.topic,
    title: name,
    question: source.question,
    scope: source.scope,
    columns: source.columns,
    rows: source.rows.map((row) => ({ key: row.key, cells: cells(row) })),
  };
  const { problems } = validateTable(table);
  if (problems.length) return { error: "That table can't be copied right now." };
  await importTables(sql, [{ ...table, private: true, forkedFrom: `${source.owner}/${source.slug}` }]);
  return { owner, slug };
}

export function forkRoutes(app: Hono, sql: Sql, tables: PublishedTable[], signedIn: SignedIn, refresh?: () => Promise<unknown>) {
  app.post("/api/tables/:owner/:slug/fork", rateLimit(CREATIONS_PER_MINUTE), async (c) => {
    const user = await signedIn(c);
    if (!user) return c.json({ error: "Sign in to fork a table." }, 401);
    const source = tables.find((table) => table.owner === c.req.param("owner") && table.slug === c.req.param("slug"));
    if (!source || !canFork(source, user)) return c.json({ error: "No such table" }, 404);
    const body = forkBody.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "Give the copy a title of up to 120 characters." }, 400);
    const [own] = await sql`select a.handle from accounts a join users u on u.account_id = a.id where u.id = ${user.id}`;
    const owner = body.data.owner ?? (own?.handle as string | undefined);
    if (!owner || !runsTable(user, owner)) return c.json({ error: "You can't add tables to that account." }, 403);
    const forked = await forkTable(sql, tables, source, owner, body.data.title);
    if ("error" in forked) return c.json(forked, 400);
    await refresh?.();
    return c.json(forked, 201);
  });
}
