import type { Context, Hono } from "hono";
import { draftChecklist, slugOfRow } from "@skeleton/tables/share";
import { z } from "zod";
import { MAX_COLUMNS, columnBody, emptyCell, isOwner, runsTable, slugOf, type SignedIn } from "./accounts.js";
import type { Sql } from "./db.js";
import type { PublishedTable } from "./library.js";

const detailsBody = z.object({
  title: z.string().trim().min(1).max(120),
  question: z.string().trim().max(300),
  topic: z.string().trim().max(40),
  scope: z.string().trim().max(800),
});

const columnChange = z.object({ label: z.string().trim().min(1).max(80), unit: z.string().trim().max(30).optional(), rule: z.string().trim().max(500) });
const publishBody = z.object({ private: z.boolean() });
const rowName = z.string().trim().min(1).max(120);
const rowChange = z.object({ key: rowName, to: rowName });
const rowRemoval = z.object({ key: rowName });

/**
 * Changing a table's shape. Removing a row or column keeps its old versions for the history, and
 * only ends its open proposals. A table's address never changes, so links to it keep working.
 */
export function manageRoutes(app: Hono, sql: Sql, tables: PublishedTable[], signedIn: SignedIn, refresh?: () => Promise<unknown>) {
  const editing = async (c: Context) => {
    const user = await signedIn(c);
    const [owner, slug] = [c.req.param("owner")!, c.req.param("slug")!];
    if (!runsTable(user, owner)) return c.json({ error: "Only the people running this table can change it." }, 403);
    const table = tables.find((t) => t.owner === owner && t.slug === slug);
    if (!table) return c.json({ error: "No such table" }, 404);
    if (table.managed) return c.json({ error: "This table is kept in the library's files, so it's changed there." }, 409);
    const [saved] = await sql`select t.id from data_tables t join accounts a on a.id = t.account_id where a.handle = ${owner} and t.slug = ${slug}`;
    return { table, id: saved!.id as string, userId: user!.id };
  };

  const finish = async (c: Context) => {
    await refresh?.();
    return c.json({ ok: true });
  };

  app.patch("/api/tables/:owner/:slug", async (c) => {
    const found = await editing(c);
    if (found instanceof Response) return found;
    const body = detailsBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success || (!found.table.draft && !(body.data.question && body.data.topic && body.data.scope))) return c.json({ error: "Fill in every field." }, 400);
    const { title, question, topic, scope } = body.data;
    await sql`update data_tables set title = ${title}, question = ${question}, topic = ${topic}, scope = ${scope} where id = ${found.id}`;
    return finish(c);
  });

  // Publishing leaves out values with no proof. They stay in the history as a past version.
  app.post("/api/tables/:owner/:slug/publish", async (c) => {
    const found = await editing(c);
    if (found instanceof Response) return found;
    if (!found.table.draft) return c.json({ error: "This table is already published." }, 409);
    if (!(await isOwner(sql, found.userId, found.table.owner))) return c.json({ error: "Only this table's owners can publish it." }, 403);
    const body = publishBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Choose public or private." }, 400);
    if (draftChecklist(found.table).items.some((item) => !item.done)) return c.json({ error: "Finish the checklist first." }, 400);
    await sql.begin(async (tx) => {
      const unproven = await tx`
        select distinct on (v.row_id, v.column_id) v.row_id, v.column_id, v.cell
        from cell_versions v join table_rows r on r.id = v.row_id
        where r.table_id = ${found.id}
        order by v.row_id, v.column_id, v.id desc`;
      for (const { row_id: rowId, column_id: columnId, cell } of unproven) {
        if (cell.unproven === undefined) continue;
        const { unproven: _left, ...rest } = cell;
        await tx`insert into cell_versions (row_id, column_id, cell, created_by) values (${rowId}, ${columnId}, ${tx.json(rest)}, ${found.userId})`;
      }
      await tx`update data_tables set draft = false, private = ${body.data.private} where id = ${found.id}`;
    });
    return finish(c);
  });

  app.delete("/api/tables/:owner/:slug", async (c) => {
    const found = await editing(c);
    if (found instanceof Response) return found;
    if (!(await isOwner(sql, found.userId, found.table.owner))) return c.json({ error: "Only this table's owners can delete it." }, 403);
    await sql`delete from data_tables where id = ${found.id}`;
    return finish(c);
  });

  app.post("/api/tables/:owner/:slug/columns", async (c) => {
    const found = await editing(c);
    if (found instanceof Response) return found;
    const body = columnBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success || (!found.table.draft && !body.data.rule)) return c.json({ error: "Give the column a name and a rule." }, 400);
    if (found.table.columns.length >= MAX_COLUMNS) return c.json({ error: "This table has reached its column limit." }, 400);
    const { label, type, unit, rule } = body.data;
    await sql.begin(async (tx) => {
      // A removed column keeps its id, so its old versions can't be mistaken for this one's.
      const used = new Set((await tx`select id from table_columns where table_id = ${found.id}`).map((column) => column.id as string));
      const base = slugOf(label).replace(/-/g, "_").replace(/^[^a-z]+/, "") || "column";
      let columnId = base;
      for (let n = 2; used.has(columnId); n++) columnId = `${base}_${n}`;
      await tx`
        insert into table_columns (table_id, id, position, label, type, unit, rule)
        select ${found.id}, ${columnId}, coalesce(max(position) + 1, 0), ${label}, ${type}, ${unit || null}, ${rule} from table_columns where table_id = ${found.id}`;
      const rows = await tx`select id from table_rows where table_id = ${found.id} and removed_at is null`;
      for (const row of rows) await tx`insert into cell_versions (row_id, column_id, cell) values (${row.id}, ${columnId}, ${tx.json(emptyCell())})`;
    });
    await refresh?.();
    return c.json({ ok: true }, 201);
  });

  app.patch("/api/tables/:owner/:slug/columns/:column", async (c) => {
    const found = await editing(c);
    if (found instanceof Response) return found;
    const body = columnChange.safeParse(await c.req.json().catch(() => null));
    if (!body.success || (!found.table.draft && !body.data.rule)) return c.json({ error: "Give the column a name and a rule." }, 400);
    const { label, unit, rule } = body.data;
    await sql`update table_columns set label = ${label}, unit = ${unit || null}, rule = ${rule} where table_id = ${found.id} and id = ${c.req.param("column")} and removed_at is null`;
    return finish(c);
  });

  app.delete("/api/tables/:owner/:slug/columns/:column", async (c) => {
    const found = await editing(c);
    if (found instanceof Response) return found;
    if (found.table.columns.length <= 1) return c.json({ error: "A table needs at least one column." }, 400);
    const column = c.req.param("column");
    await sql.begin(async (tx) => {
      await tx`update table_columns set removed_at = now() where table_id = ${found.id} and id = ${column}`;
      await tx`update proposals set status = 'rejected', decided_by = ${found.userId}, decided_at = now() where table_id = ${found.id} and column_id = ${column} and status = 'open'`;
    });
    return finish(c);
  });

  app.patch("/api/tables/:owner/:slug/rows", async (c) => {
    const found = await editing(c);
    if (found instanceof Response) return found;
    const body = rowChange.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Enter a name for the row." }, 400);
    const { key, to } = body.data;
    if (key === to) return c.json({ ok: true });
    const [taken] = await sql`select 1 from table_rows where table_id = ${found.id} and key = ${to}`;
    if (taken) return c.json({ error: "A row has had that name already." }, 409);
    // The old address stays with the row, so links to it keep working.
    await sql`update table_rows set key = ${to}, former_slugs = array_append(former_slugs, ${slugOfRow(key)}) where table_id = ${found.id} and key = ${key} and removed_at is null`;
    return finish(c);
  });

  app.delete("/api/tables/:owner/:slug/rows", async (c) => {
    const found = await editing(c);
    if (found instanceof Response) return found;
    const body = rowRemoval.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Name the row to remove." }, 400);
    if (found.table.rows.length <= 1) return c.json({ error: "A table needs at least one row." }, 400);
    await sql.begin(async (tx) => {
      const [row] = await tx`update table_rows set removed_at = now() where table_id = ${found.id} and key = ${body.data.key} and removed_at is null returning id`;
      if (row) await tx`update proposals set status = 'rejected', decided_by = ${found.userId}, decided_at = now() where row_id = ${row.id} and status = 'open'`;
    });
    return finish(c);
  });
}
