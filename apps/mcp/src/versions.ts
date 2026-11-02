import { tableSchema, type Table } from "@skeleton/tables/format";
import type { Context, Hono } from "hono";
import { z } from "zod";
import { runsTable, type SignedIn } from "./accounts.js";
import { canRead, type Viewer } from "./access.js";
import type { Sql } from "./db.js";
import type { PublishedTable, VersionInfo } from "./library.js";

/**
 * A saved version: the table exactly as it stood, kept apart from the live one so it never changes.
 * It's what a model was trained on or a report cited. The live table carries on, and each version
 * says what changed since the one before.
 */

export const MAX_VERSIONS = 100;

const noteBody = z.object({ note: z.string().trim().max(200).default("") });

type Frozen = Pick<Table, "title" | "question" | "topic" | "scope" | "proof" | "columns" | "rows">;

/** A version, read back as a table, with what it is and what changed since the one before. */
export type VersionedTable = PublishedTable & { version: VersionInfo & { changes?: VersionChanges } };

export type VersionChanges = { rowsAdded: number; rowsRemoved: number; valuesChanged: number };

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const valueOf = (cell: Table["rows"][number]["cells"][string] | undefined) => (cell && !("missing" in cell) ? cell.value : undefined);

/** How one version differs from the one before: rows in and out, and values that changed in rows both have. */
export function versionChanges(before: Pick<Table, "rows" | "columns">, after: Pick<Table, "rows" | "columns">): VersionChanges {
  const old = new Map(before.rows.map((row) => [row.key, row]));
  const keys = new Set(after.rows.map((row) => row.key));
  let valuesChanged = 0;
  for (const row of after.rows) {
    const was = old.get(row.key);
    if (!was) continue;
    for (const column of after.columns) if (!sameValue(valueOf(was.cells[column.id]), valueOf(row.cells[column.id]))) valuesChanged += 1;
  }
  return { rowsAdded: after.rows.filter((row) => !old.has(row.key)).length, rowsRemoved: before.rows.filter((row) => !keys.has(row.key)).length, valuesChanged };
}

const tableRow = async (sql: Sql, table: { owner: string; slug: string }) =>
  (await sql`select t.id from data_tables t join accounts a on a.id = t.account_id where a.handle = ${table.owner} and t.slug = ${table.slug}`)[0]?.id as string | undefined;

/** Freeze the table as it stands now. */
export async function saveVersion(sql: Sql, table: PublishedTable, note: string, userId?: string): Promise<{ number: number } | { error: string }> {
  const id = await tableRow(sql, table);
  if (!id) return { error: "There's no such table." };
  if ((table.versions?.length ?? 0) >= MAX_VERSIONS) return { error: `A table keeps at most ${MAX_VERSIONS} versions.` };
  const { title, question, topic, scope, proof, columns, rows } = table;
  const data: Frozen = { title, question, topic, scope, ...(proof && { proof }), columns, rows };
  const [saved] = await sql`
    insert into table_versions (table_id, number, note, data, created_by)
    select ${id}, coalesce(max(number), 0) + 1, ${note.trim()}, ${sql.json(data as never)}, ${userId ?? null} from table_versions where table_id = ${id}
    returning number`;
  return { number: saved!.number as number };
}

/** A saved version as a table, or undefined if there's no such version. */
export async function loadVersion(sql: Sql, table: PublishedTable, number: number): Promise<VersionedTable | undefined> {
  if (!Number.isInteger(number) || number < 1) return undefined;
  const id = await tableRow(sql, table);
  const found = id ? await sql`select number, note, created_at, data from table_versions where table_id = ${id} and number in (${number}, ${number - 1}) order by number` : [];
  const current = found.find((row) => row.number === number);
  if (!current) return undefined;
  const data = current.data as Frozen;
  const previous = found.find((row) => row.number === number - 1)?.data as Frozen | undefined;
  const { watch: _watch, moved: _moved, ...live } = table;
  const parsed = tableSchema.safeParse({ ...live, ...data, format: 1, owner: table.owner, slug: table.slug, draft: undefined });
  const frozen = parsed.success ? parsed.data : { ...live, ...data };
  return {
    ...live,
    ...frozen,
    version: {
      number,
      note: current.note as string,
      created: (current.created_at as Date).toISOString().slice(0, 10),
      rows: data.rows.length,
      ...(previous && { changes: versionChanges(previous, data) }),
    },
  } as VersionedTable;
}

/** A version number from an address like `v3`, or a bare 3. */
export const versionNumber = (text: string) => {
  const match = /^v?(\d{1,6})$/.exec(text);
  return match ? Number(match[1]) : undefined;
};

export function versionRoutes(app: Hono, sql: Sql, tables: PublishedTable[], signedIn: SignedIn, viewerOf: (c: Context) => Promise<Viewer>, refresh?: () => Promise<unknown>) {
  const find = (c: Context) => tables.find((table) => table.owner === c.req.param("owner") && table.slug === c.req.param("slug"));

  app.post("/api/tables/:owner/:slug/versions", async (c) => {
    const user = await signedIn(c);
    const table = find(c);
    if (!table || !runsTable(user, table.owner)) return c.json({ error: "Only the people running this table can save a version." }, 403);
    const body = noteBody.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "Keep the note under 200 characters." }, 400);
    const saved = await saveVersion(sql, table, body.data.note, user!.id);
    if ("error" in saved) return c.json(saved, 400);
    await refresh?.();
    return c.json(saved, 201);
  });

  app.get("/api/tables/:owner/:slug/versions/:number", async (c) => {
    const table = find(c);
    const number = versionNumber(c.req.param("number"));
    if (!table || !number || !canRead(table, await viewerOf(c))) return c.json({ error: "No such version" }, 404);
    const version = await loadVersion(sql, table, number);
    return version ? c.json(version) : c.json({ error: "No such version" }, 404);
  });
}
