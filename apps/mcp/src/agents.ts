import { liveFetcher, type Fetcher } from "@skeleton/tables";
import { isFound, isGiven, proofOptional, type Cell, type Origin } from "@skeleton/tables/format";
import { addColumn, addRow, createTable, MAX_COLUMNS, MAX_ROWS, tableBody } from "./accounts.js";
import { viewerFor } from "./access.js";
import type { Sql } from "./db.js";
import type { PublishedTable } from "./library.js";
import { asValue, decideProposal, submitProposal } from "./proposals.js";

export const MAX_CELLS_PER_CALL = 200;
// A quoted value opens its page before it's saved, so fewer of those fit in one call.
export const MAX_QUOTED_PER_CALL = 25;

export type NewDraft = { owner?: string; title: string; question?: string; topic?: string; scope?: string; proof?: "required" | "optional"; columns: { label: string; type: "text" | "number" | "boolean"; unit?: string; rule?: string }[]; rows: string[] };
export type CellFill = { row: string; column: string; value?: string; source?: string; quote?: string; origin?: Origin; note?: string; checked?: string[]; none_stated?: boolean };

const today = () => new Date().toISOString().slice(0, 10);

/** Reads each page once per call, however many cells it proves. */
function remembering(fetcher: Fetcher): Fetcher {
  const pages = new Map<string, ReturnType<Fetcher>>();
  return (url) => {
    if (!pages.has(url)) pages.set(url, fetcher(url));
    return pages.get(url)!;
  };
}

/**
 * What an agent can do with its person's token. It only builds drafts that person runs, so nothing
 * reaches a published table this way: a draft's values still pass every check, and a person publishes it.
 */
export function agentActions(sql: Sql, tables: PublishedTable[], userId: string, publicUrl: string, refresh?: () => Promise<unknown>, pages?: Fetcher) {
  const running = async (slug: string) => {
    const { accounts } = await viewerFor(sql, userId);
    const table = tables.find((t) => accounts.includes(t.owner) && (`${t.owner}/${t.slug}` === slug || t.slug === slug));
    if (!table) return { error: `You don't run a table called ${slug}.` };
    if (!table.draft) return { error: "This only works on a draft. Use propose_change for a published table." };
    return { table };
  };

  const create = async (input: NewDraft) => {
    const { accounts } = await viewerFor(sql, userId);
    const [own] = await sql`select a.handle from accounts a join users u on u.account_id = a.id where u.id = ${userId}`;
    const owner = input.owner ?? (own?.handle as string | undefined);
    if (!owner || !accounts.includes(owner)) return { error: "You can't add tables to that account." };
    const body = tableBody.safeParse({ ...input, owner, draft: true });
    if (!body.success) return { error: "A table needs a title, at least one column and at least one row." };
    if (new Set(body.data.rows).size !== body.data.rows.length) return { error: "Each row needs its own name." };
    const created = await createTable(sql, tables, owner, body.data);
    if (!created) return { error: "That table isn't valid. Check its columns and rows." };
    await refresh?.();
    return { ...created, url: `${publicUrl}/${created.owner}/${created.slug}/sheet` };
  };

  const addRows = async (slug: string, rows: string[]) => {
    const found = await running(slug);
    if ("error" in found) return found;
    const { table } = found;
    const fresh = [...new Set(rows.map((row) => row.trim()).filter(Boolean))].filter((row) => !table.rows.some((held) => held.key === row));
    if (table.rows.length + fresh.length > MAX_ROWS) return { error: "That's more rows than a table can hold." };
    for (const key of fresh) await addRow(sql, table, key);
    await refresh?.();
    return { added: fresh.length };
  };

  const addColumns = async (slug: string, columns: NewDraft["columns"]) => {
    const found = await running(slug);
    if ("error" in found) return found;
    const { table } = found;
    if (table.columns.length + columns.length > MAX_COLUMNS) return { error: "That's more columns than a table can hold." };
    const [saved] = await sql`select t.id from data_tables t join accounts a on a.id = t.account_id where a.handle = ${table.owner} and t.slug = ${table.slug}`;
    const ids = [];
    for (const { rule = "", ...column } of columns) ids.push({ id: await sql.begin((tx) => addColumn(tx, saved!.id as string, { ...column, rule })), label: column.label });
    await refresh?.();
    return { columns: ids };
  };

  const fillOne = async (slug: string, fill: CellFill, fetcher: Fetcher) => {
    const found = await running(slug);
    if ("error" in found) return found;
    const { table } = found;
    const { row, column } = fill;
    if (fill.value !== undefined) {
      if (!fill.source || !fill.quote) return { error: "A value needs its source and exact quote." };
      const result = await submitProposal(sql, [table], { owner: table.owner, slug: table.slug, row, column, value: fill.value, source: fill.source, quote: fill.quote }, userId, "agent", fetcher);
      if ("error" in result) return result;
      if (!(await decideProposal(sql, result.id, userId, true))) return { error: "The cell changed while saving. Read the table again before retrying." };
      return { saved: true, check: result.check };
    }
    const held = table.rows.find((candidate) => candidate.key === row)?.cells[column];
    if (!held) return { error: "There's no such cell." };
    if (isFound(held)) return { error: "That cell already has a value." };
    if (!fill.checked?.length) return { error: "Give a value with its proof, or list where you looked in `checked`." };
    if (!fill.checked.every((url) => URL.canParse(url))) return { error: "Every entry in `checked` must be a full address." };
    const cell = { missing: true as const, checked: fill.checked.slice(0, 10), read: today(), ...(fill.none_stated && { absent: true as const }) };
    await sql`
      insert into cell_versions (row_id, column_id, cell, created_by)
      select r.id, ${column}, ${sql.json(cell)}, ${userId}
      from table_rows r join data_tables t on t.id = r.table_id join accounts a on a.id = t.account_id
      where a.handle = ${table.owner} and t.slug = ${table.slug} and r.key = ${row}`;
    return { saved: true };
  };

  /** A value that says where it came from instead of quoting a source, ready to save, or why it can't be. */
  const given = (table: PublishedTable, fill: CellFill): { cell: Cell } | { error: string } => {
    if (!proofOptional(table)) return { error: "This table needs a source and exact quote for every value. Give `quote`, or ask its owner to make proof optional." };
    const row = table.rows.find((candidate) => candidate.key === fill.row);
    const column = table.columns.find((candidate) => candidate.id === fill.column);
    const held = row?.cells[fill.column];
    if (!row || !column || !held) return { error: "There's no such cell." };
    if (isFound(held)) return { error: "That cell already has a quoted value." };
    const origin = fill.origin ?? (fill.source ? "link" : "generated");
    if (fill.source !== undefined && !URL.canParse(fill.source)) return { error: "`source` must be a full address." };
    if (origin === "link" && !fill.source) return { error: "A value from a link needs its `source`." };
    const value = asValue(column, fill.value ?? "");
    if (value === undefined) return { error: `Give a ${column.type === "text" ? "value" : column.type} for ${column.label}.` };
    const note = fill.note?.trim();
    return { cell: { value, origin, ...(fill.source && { source: fill.source }), ...(note && { note: note.slice(0, 500) }), read: today() } };
  };

  /**
   * Fill cells. A quoted value is checked against its page and saved on its own, so each shows up
   * in an open sheet as it's done. Values that say where they came from are saved together. One bad
   * cell doesn't stop the rest.
   */
  const fill = async (slug: string, cells: CellFill[]) => {
    const found = await running(slug);
    if ("error" in found) return { saved: 0, of: cells.length, results: cells.map(({ row, column }) => ({ row, column, error: found.error })) };
    const quoted = cells.filter((cell) => cell.value !== undefined && cell.quote !== undefined).length;
    if (quoted > MAX_QUOTED_PER_CALL) return { error: `Send at most ${MAX_QUOTED_PER_CALL} quoted values at a time, since each page is opened before it's saved.` };
    const fetcher = remembering(pages ?? liveFetcher());
    const results: ({ row: string; column: string } & ({ saved: true; origin?: Origin; check?: string } | { error: string }))[] = [];
    const batch: { at: number; fill: CellFill; cell: Cell }[] = [];
    for (const cell of cells) {
      if (cell.value !== undefined && cell.quote === undefined) {
        const made = given(found.table, cell);
        if ("error" in made) results.push({ row: cell.row, column: cell.column, ...made });
        else {
          batch.push({ at: results.length, fill: cell, cell: made.cell });
          results.push({ row: cell.row, column: cell.column, saved: true, origin: isGiven(made.cell) ? made.cell.origin : undefined });
        }
        continue;
      }
      results.push({ row: cell.row, column: cell.column, ...(await fillOne(slug, cell, fetcher)) } as (typeof results)[number]);
      await refresh?.();
    }
    if (batch.length) {
      const { table } = found;
      await sql.begin(async (tx) => {
        const rows = await tx`select r.id, r.key from table_rows r join data_tables t on t.id = r.table_id join accounts a on a.id = t.account_id
          where a.handle = ${table.owner} and t.slug = ${table.slug} and r.removed_at is null`;
        const ids = new Map(rows.map((row) => [row.key as string, row.id as string]));
        for (const { at, fill: { row, column }, cell } of batch) {
          const rowId = ids.get(row);
          if (!rowId) {
            results[at] = { row, column, error: "There's no such cell." };
            continue;
          }
          // A quoted value saved since the table was read stays.
          const [held] = await tx`select cell from cell_versions where row_id = ${rowId} and column_id = ${column} order by id desc limit 1`;
          if (held && isFound(held.cell as Cell)) {
            results[at] = { row, column, error: "That cell already has a quoted value." };
            continue;
          }
          await tx`insert into cell_versions (row_id, column_id, cell, created_by) values (${rowId}, ${column}, ${tx.json(cell as never)}, ${userId})`;
        }
      });
      await refresh?.();
    }
    return { saved: results.filter((result) => "saved" in result).length, of: cells.length, results };
  };

  return { create, addColumns, addRows, fill };
}

export type AgentActions = ReturnType<typeof agentActions>;
