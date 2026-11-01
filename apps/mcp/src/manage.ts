import type { Context, Hono } from "hono";
import { draftChecklist, slugOfRow } from "@skeleton/tables/share";
import { z } from "zod";
import { MAX_COLUMNS, MAX_ROWS, addColumn, addRow, columnBody, emptyCell, freeSlug, isOwner, runsTable, type SignedIn } from "./accounts.js";
import type { Sql } from "./db.js";
import type { PublishedTable } from "./library.js";
import { asValue } from "./proposals.js";

const detailsBody = z.object({
  title: z.string().trim().min(1).max(120),
  question: z.string().trim().max(300),
  topic: z.string().trim().max(40),
  scope: z.string().trim().max(800),
});

const columnChange = z.object({ label: z.string().trim().min(1).max(80), type: z.enum(["text", "number", "boolean"]).optional(), unit: z.string().trim().max(30).optional(), rule: z.string().trim().max(500) });
const gridChange = z.object({
  addColumns: z.array(columnBody).max(MAX_COLUMNS).default([]),
  addRows: z.array(z.string().trim().min(1).max(120)).max(MAX_ROWS).default([]),
  // `column` is a column's id, or `new:0` for the first of `addColumns`. An empty value clears the cell.
  cells: z.array(z.object({ row: z.string().max(120), column: z.string().max(80), value: z.string().trim().max(300) })).max(MAX_ROWS * MAX_COLUMNS).default([]),
});
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
    // Nothing links to a draft yet, so its address can follow its title. After that it never changes.
    const slug = found.table.draft ? freeSlug(tables, found.table.owner, title, found.table.slug) : found.table.slug;
    await sql`update data_tables set title = ${title}, question = ${question}, topic = ${topic}, scope = ${scope}, slug = ${slug} where id = ${found.id}`;
    await refresh?.();
    return c.json({ ok: true, slug });
  });

  // What's typed or pasted into a draft, all at once. Values here have no proof yet, so a proved cell is left alone.
  app.post("/api/tables/:owner/:slug/grid", async (c) => {
    const found = await editing(c);
    if (found instanceof Response) return found;
    const { table } = found;
    if (!table.draft) return c.json({ error: "A published table's values need their proof." }, 409);
    const body = gridChange.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "That didn't save." }, 400);
    const { addColumns, addRows, cells } = body.data;
    const freshRows = [...new Set(addRows)].filter((key) => !table.rows.some((row) => row.key === key));
    if (table.rows.length + freshRows.length > MAX_ROWS) return c.json({ error: "That's more rows than a table can hold." }, 400);
    if (table.columns.length + addColumns.length > MAX_COLUMNS) return c.json({ error: "That's more columns than a table can hold." }, 400);
    for (const key of freshRows) await addRow(sql, table, key);
    await sql.begin(async (tx) => {
      const made = [];
      for (const column of addColumns) made.push({ id: await addColumn(tx, found.id, column), type: column.type });
      const rows = await tx`select id, key from table_rows where table_id = ${found.id} and removed_at is null`;
      for (const { row, column, value } of cells) {
        const target = column.startsWith("new:") ? made[Number(column.slice(4))] : table.columns.find((candidate) => candidate.id === column);
        const rowId = rows.find((candidate) => candidate.key === row)?.id;
        if (!target || !rowId) continue;
        const [held] = await tx`select cell from cell_versions where row_id = ${rowId} and column_id = ${target.id} order by id desc limit 1`;
        if (held && !held.cell.missing) continue;
        const parsed = value ? asValue({ type: target.type as "text" }, value) : undefined;
        const { unproven: _old, ...blank } = (held?.cell ?? emptyCell()) as Record<string, unknown>;
        await tx`insert into cell_versions (row_id, column_id, cell, created_by) values (${rowId}, ${target.id}, ${tx.json({ ...blank, ...(parsed !== undefined && { unproven: parsed }) } as never)}, ${found.userId})`;
      }
    });
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
    await sql.begin((tx) => addColumn(tx, found.id, body.data));
    await refresh?.();
    return c.json({ ok: true }, 201);
  });

  app.patch("/api/tables/:owner/:slug/columns/:column", async (c) => {
    const found = await editing(c);
    if (found instanceof Response) return found;
    const body = columnChange.safeParse(await c.req.json().catch(() => null));
    if (!body.success || (!found.table.draft && !body.data.rule)) return c.json({ error: "Give the column a name and a rule." }, 400);
    const { label, unit, rule } = body.data;
    const columnId = c.req.param("column")!;
    // A value was checked against its column's type, so only a column with no proved values can change it.
    const hasProof = found.table.rows.some((row) => row.cells[columnId] && !("missing" in row.cells[columnId]));
    const type = body.data.type && found.table.draft && !hasProof ? body.data.type : undefined;
    await sql`update table_columns set label = ${label}, unit = ${unit || null}, rule = ${rule}, type = coalesce(${type ?? null}, type) where table_id = ${found.id} and id = ${columnId} and removed_at is null`;
    return finish(c);
  });

  app.delete("/api/tables/:owner/:slug/columns/:column", async (c) => {
    const found = await editing(c);
    if (found instanceof Response) return found;
    if (found.table.columns.length <= 1 && !found.table.draft) return c.json({ error: "A table needs at least one column." }, 400);
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
    if (found.table.rows.length <= 1 && !found.table.draft) return c.json({ error: "A table needs at least one row." }, 400);
    await sql.begin(async (tx) => {
      const [row] = await tx`update table_rows set removed_at = now() where table_id = ${found.id} and key = ${body.data.key} and removed_at is null returning id`;
      if (row) await tx`update proposals set status = 'rejected', decided_by = ${found.userId}, decided_at = now() where row_id = ${row.id} and status = 'open'`;
    });
    return finish(c);
  });
}
