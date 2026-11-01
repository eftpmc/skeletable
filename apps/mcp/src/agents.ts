import { liveFetcher, type Fetcher } from "@skeleton/tables";
import { isFound } from "@skeleton/tables/format";
import { addColumn, addRow, createTable, MAX_COLUMNS, MAX_ROWS, tableBody } from "./accounts.js";
import { viewerFor } from "./access.js";
import type { Sql } from "./db.js";
import type { PublishedTable } from "./library.js";
import { decideProposal, submitProposal } from "./proposals.js";

export const MAX_CELLS_PER_CALL = 25;

export type NewDraft = { owner?: string; title: string; question?: string; topic?: string; scope?: string; columns: { label: string; type: "text" | "number" | "boolean"; unit?: string; rule?: string }[]; rows: string[] };
export type CellFill = { row: string; column: string; value?: string; source?: string; quote?: string; checked?: string[]; none_stated?: boolean };

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
      await decideProposal(sql, result.id, userId, true);
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

  /** Fill cells one at a time, so each shows up in an open sheet as it's done. One bad cell doesn't stop the rest. */
  const fill = async (slug: string, cells: CellFill[]) => {
    const fetcher = remembering(pages ?? liveFetcher());
    const results = [];
    for (const cell of cells) {
      results.push({ row: cell.row, column: cell.column, ...(await fillOne(slug, cell, fetcher)) });
      await refresh?.();
    }
    return { saved: results.filter((result) => "saved" in result).length, of: cells.length, results };
  };

  return { create, addColumns, addRows, fill };
}

export type AgentActions = ReturnType<typeof agentActions>;
