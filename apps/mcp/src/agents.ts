import { liveFetcher, type Fetcher } from "@skeleton/tables";
import { aiCellState, aiProgress, matchChoice, rowPrompt } from "@skeleton/tables/columns";
import { isFound, isGiven, proofOptional, type Cell, type Column, type Origin } from "@skeleton/tables/format";
import { addColumn, addRow, addRowsAt, aiFields, createTable, MAX_COLUMNS, MAX_ROWS, tableBody } from "./accounts.js";
import { viewerFor } from "./access.js";
import { canFork, forkTable } from "./forks.js";
import { dataKey, dataLinkUrl, loadSnippets } from "./links.js";
import { saveVersion } from "./versions.js";
import type { Sql } from "./db.js";
import type { PublishedTable } from "./library.js";
import { asValue, decideProposal, submitProposal } from "./proposals.js";

export const MAX_CELLS_PER_CALL = 200;
// A quoted value opens its page before it's saved, so fewer of those fit in one call.
export const MAX_QUOTED_PER_CALL = 25;

export type NewColumn = { label: string; type: "text" | "number" | "boolean"; unit?: string; rule?: string; instruction?: string; choices?: string[] };
export type NewDraft = { owner?: string; title: string; question?: string; topic?: string; scope?: string; proof?: "required" | "optional"; columns: NewColumn[]; rows: string[] };
export type NewRow = string | { key?: string; values?: Record<string, string | number | boolean>; origin?: Origin; source?: string; note?: string };
export type AiAnswer = { row: string; value: string; basis: string };

/** What went wrong with one cell or row, in a reply that otherwise only counts. */
type Problem = { row: string; column?: string; error: string };
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
 * What an agent can do with its person's token. It builds drafts that person runs, so nothing quoted
 * reaches a published table this way: a draft's values still pass every check, and a person publishes
 * it. Where proof is optional, values that say where they came from can also go into a published
 * table, as a person typing them into the sheet could.
 * Replies count what worked and list only what didn't, so a big batch comes back small.
 */
export function agentActions(sql: Sql, tables: PublishedTable[], userId: string, publicUrl: string, refresh?: () => Promise<unknown>, pages?: Fetcher) {
  const own = async (slug: string) => {
    const { accounts } = await viewerFor(sql, userId);
    const table = tables.find((t) => accounts.includes(t.owner) && (`${t.owner}/${t.slug}` === slug || t.slug === slug));
    return table ? { table } : { error: `You don't run a table called ${slug}.` };
  };
  /** A table this person runs that can take these changes: a draft, or a published one when the values need no proof. */
  const running = async (slug: string, { unquoted = false } = {}) => {
    const found = await own(slug);
    if ("error" in found) return found;
    if (!found.table.draft && !(unquoted && proofOptional(found.table))) return { error: "This only works on a draft. Use propose_change for a published table." };
    return found;
  };
  const columnOf = (table: PublishedTable, name: string) => table.columns.find((column) => column.id === name) ?? table.columns.find((column) => column.label.toLowerCase() === name.trim().toLowerCase());
  const tableId = async (table: PublishedTable) => (await sql`select t.id from data_tables t join accounts a on a.id = t.account_id where a.handle = ${table.owner} and t.slug = ${table.slug}`)[0]!.id as string;
  const tableUrl = (table: { owner: string; slug: string }) => `${publicUrl}/${table.owner}/${table.slug}/sheet`;

  const create = async (input: NewDraft) => {
    const { accounts } = await viewerFor(sql, userId);
    const [mine] = await sql`select a.handle from accounts a join users u on u.account_id = a.id where u.id = ${userId}`;
    const owner = input.owner ?? (mine?.handle as string | undefined);
    if (!owner || !accounts.includes(owner)) return { error: "You can't add tables to that account." };
    const body = tableBody.safeParse({ ...input, owner, draft: true });
    if (!body.success) return { error: "A table needs a title, at least one column and at least one row." };
    if (new Set(body.data.rows).size !== body.data.rows.length) return { error: "Each row needs its own name." };
    if (body.data.proof !== "optional" && body.data.columns.some((column) => column.instruction?.trim())) return { error: "An AI column needs a table whose proof is optional. Set `proof` to `optional`." };
    const created = await createTable(sql, tables, owner, body.data);
    if (!created) return { error: "That table isn't valid. Check its columns and rows." };
    await refresh?.();
    return { ...created, url: tableUrl(created) };
  };

  /**
   * Save values without quotes, each only where `allowed` says the cell may change, as one
   * transaction. Returns the ones it refused, by their place in `items`.
   */
  const saveGiven = async (table: PublishedTable, items: { row: string; column: string; cell: Cell }[], allowed: (held: Cell | undefined) => string | undefined) => {
    const refused = new Map<number, string>();
    if (!items.length) return refused;
    await sql.begin(async (tx) => {
      const rows = await tx`select r.id, r.key from table_rows r join data_tables t on t.id = r.table_id join accounts a on a.id = t.account_id
        where a.handle = ${table.owner} and t.slug = ${table.slug} and r.removed_at is null`;
      const ids = new Map(rows.map((row) => [row.key as string, row.id as string]));
      const held = await tx`select distinct on (v.row_id, v.column_id) v.row_id, v.column_id, v.cell from cell_versions v
        where v.row_id = any(${[...ids.values()]}::bigint[]) order by v.row_id, v.column_id, v.id desc`;
      const current = new Map(held.map((cell) => [`${cell.row_id}/${cell.column_id}`, cell.cell as Cell]));
      const [rowIds, columnIds, cells] = [[] as string[], [] as string[], [] as string[]];
      for (const [index, { row, column, cell }] of items.entries()) {
        const rowId = ids.get(row);
        // Checked against the database, so a value saved since the table was read is respected.
        const why = rowId ? allowed(current.get(`${rowId}/${column}`)) : "There's no such row.";
        if (why) {
          refused.set(index, why);
          continue;
        }
        rowIds.push(rowId!);
        columnIds.push(column);
        cells.push(JSON.stringify(cell));
      }
      if (rowIds.length) {
        await tx`insert into cell_versions (row_id, column_id, cell, created_by)
          select r, c, v::jsonb, ${userId} from unnest(${rowIds}::bigint[], ${columnIds}::text[], ${cells}::text[]) as x(r, c, v)`;
      }
    });
    return refused;
  };
  const notQuoted = (held: Cell | undefined) => (held && isFound(held) ? "That cell already has a quoted value." : undefined);

  /** A value that says where it came from instead of quoting a source, ready to save, or why it can't be. */
  const given = (table: PublishedTable, column: Column | undefined, raw: string | number | boolean | undefined, how: { origin?: Origin; source?: string; note?: string }): { cell: Cell } | { error: string } => {
    if (!proofOptional(table)) return { error: "This table needs a source and exact quote for every value. Give `quote`, or ask its owner to make proof optional." };
    if (!column) return { error: "There's no such column." };
    const origin = how.origin ?? (how.source ? "link" : "generated");
    if (how.source !== undefined && !URL.canParse(how.source)) return { error: "`source` must be a full address." };
    if (origin === "link" && !how.source) return { error: "A value from a link needs its `source`." };
    const value = asValue(column, raw === undefined ? "" : String(raw));
    if (value === undefined) return { error: `Give a ${column.type === "text" ? "value" : column.type} for ${column.label}.` };
    const note = how.note?.trim();
    return { cell: { value, origin, ...(how.source && { source: how.source }), ...(note && { note: note.slice(0, 500) }), read: today() } };
  };

  /**
   * Add rows, each by name or with its values. A row given without a name gets the next free number.
   * A name the table already has is skipped. Values need a table whose proof is optional.
   */
  const addRows = async (slug: string, rows: NewRow[]) => {
    const wantsValues = rows.some((row) => typeof row !== "string" && row.values && Object.keys(row.values).length);
    const found = await running(slug, { unquoted: true });
    if ("error" in found) return found;
    const { table } = found;
    if (!table.draft && !wantsValues) return { error: "Rows without values only go into a draft." };
    if (wantsValues && !proofOptional(table)) return { error: "This table needs a source and exact quote for every value, so add rows by name here and fill them with fill_cells." };
    const taken = new Map((await sql`select r.key, r.removed_at is not null as removed from table_rows r where r.table_id = ${await tableId(table)}`).map((row) => [row.key as string, row.removed as boolean]));
    let next = taken.size + 1;
    const nextKey = () => {
      while (taken.has(String(next))) next += 1;
      return String(next++);
    };
    const problems: Problem[] = [];
    const fresh: { key: string; cells: Record<string, Cell> }[] = [];
    const restored: { key: string; cells: Record<string, Cell> }[] = [];
    let skipped = 0;
    for (const entry of rows) {
      const row = typeof entry === "string" ? { key: entry } : entry;
      const named = row.key?.trim();
      if (named && (taken.get(named) === false || fresh.some((made) => made.key === named))) {
        skipped += 1;
        continue;
      }
      const key = named || nextKey();
      const cells: Record<string, Cell> = {};
      let error: string | undefined;
      for (const [name, raw] of Object.entries(row.values ?? {})) {
        const made = given(table, columnOf(table, name), raw, row);
        if ("error" in made) {
          error = `${name}: ${made.error}`;
          break;
        }
        cells[columnOf(table, name)!.id] = made.cell;
      }
      if (error) {
        problems.push({ row: key, error });
        continue;
      }
      (taken.get(key) === true ? restored : fresh).push({ key, cells });
      taken.set(key, false);
    }
    if (table.rows.length + fresh.length + restored.length > MAX_ROWS) return { error: `A table holds at most ${MAX_ROWS} rows.` };
    await addRowsAt(sql, table, fresh, userId);
    for (const { key } of restored) await addRow(sql, table, key);
    await saveGiven(table, restored.flatMap(({ key, cells }) => Object.entries(cells).map(([column, cell]) => ({ row: key, column, cell }))), notQuoted);
    await refresh?.();
    const added = fresh.length + restored.length;
    return { added, ...(skipped && { skipped }), ...(problems.length && { errors: problems }), ...(added && { names: [...fresh, ...restored].map((row) => row.key) }) };
  };

  const addColumns = async (slug: string, columns: NewColumn[]) => {
    const found = await running(slug);
    if ("error" in found) return found;
    const { table } = found;
    if (table.columns.length + columns.length > MAX_COLUMNS) return { error: "That's more columns than a table can hold." };
    if (!proofOptional(table) && columns.some((column) => column.instruction?.trim())) return { error: "An AI column needs a table whose proof is optional." };
    const id = await tableId(table);
    const ids = [];
    for (const { rule = "", ...column } of columns) ids.push({ id: await sql.begin((tx) => addColumn(tx, id, { ...column, rule })), label: column.label });
    await refresh?.();
    return { columns: ids };
  };

  const fillOne = async (table: PublishedTable, fill: CellFill, fetcher: Fetcher) => {
    const { row, column } = fill;
    if (fill.value !== undefined) {
      if (!fill.source || !fill.quote) return { error: "A value needs its source and exact quote." };
      const result = await submitProposal(sql, [table], { owner: table.owner, slug: table.slug, row, column, value: fill.value, source: fill.source, quote: fill.quote }, userId, "agent", fetcher);
      if ("error" in result) return result;
      if (!(await decideProposal(sql, result.id, userId, true))) return { error: "The cell changed while saving. Read the table again before retrying." };
      return { check: result.check };
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
    return {};
  };

  /**
   * Fill cells. A quoted value is checked against its page and saved on its own, so each shows up
   * in an open sheet as it's done. Values that say where they came from are saved together. One bad
   * cell doesn't stop the rest.
   */
  const fill = async (slug: string, cells: CellFill[]) => {
    const quoted = cells.filter((cell) => cell.value !== undefined && cell.quote !== undefined).length;
    const found = await running(slug, { unquoted: quoted === 0 && cells.every((cell) => cell.value !== undefined) });
    if ("error" in found) return { saved: 0, of: cells.length, errors: cells.map(({ row, column }) => ({ row, column, error: found.error })) };
    if (quoted > MAX_QUOTED_PER_CALL) return { error: `Send at most ${MAX_QUOTED_PER_CALL} quoted values at a time, since each page is opened before it's saved.` };
    const { table } = found;
    const fetcher = remembering(pages ?? liveFetcher());
    const problems: Problem[] = [];
    const checks: { row: string; column: string; check: string }[] = [];
    const batch: { row: string; column: string; cell: Cell }[] = [];
    for (const cell of cells) {
      const { row, column } = cell;
      if (cell.value !== undefined && cell.quote === undefined) {
        const exists = table.rows.find((candidate) => candidate.key === row)?.cells[column];
        const made = exists ? given(table, columnOf(table, column), cell.value, cell) : { error: "There's no such cell." };
        if ("error" in made) problems.push({ row, column, error: made.error });
        else batch.push({ row, column: columnOf(table, column)!.id, cell: made.cell });
        continue;
      }
      const result = await fillOne(table, cell, fetcher);
      if ("error" in result) problems.push({ row, column, error: result.error! });
      // A page we couldn't read still saves the value, so say which ones a person should open.
      else if ("check" in result && result.check !== "found") checks.push({ row, column, check: result.check! });
      await refresh?.();
    }
    const refused = await saveGiven(table, batch, notQuoted);
    for (const [index, error] of refused) problems.push({ row: batch[index]!.row, column: batch[index]!.column, error });
    if (batch.length) await refresh?.();
    return { saved: cells.length - problems.length, of: cells.length, ...(problems.length && { errors: problems }), ...(checks.length && { unchecked: checks }) };
  };

  /** The table's private data link, made if it has none, with lines to load it. */
  const dataLink = async (slug: string, fresh = false) => {
    const found = await own(slug);
    if ("error" in found) return found;
    const key = await dataKey(sql, found.table, fresh);
    const url = dataLinkUrl(publicUrl, key!);
    return { url, ...loadSnippets(url), note: "Anyone with this link can read the table's data. Making a new one stops this one working." };
  };

  const version = async (slug: string, note = "") => {
    const found = await own(slug);
    if ("error" in found) return found;
    const saved = await saveVersion(sql, found.table, note, userId);
    if ("error" in saved) return saved;
    await refresh?.();
    return { ...saved, url: `${publicUrl}/${found.table.owner}/${found.table.slug}/v/${saved.number}` };
  };

  const fork = async (slug: string, title?: string, owner?: string) => {
    const viewer = await viewerFor(sql, userId);
    const source = tables.find((t) => `${t.owner}/${t.slug}` === slug) ?? tables.find((t) => t.slug === slug && canFork(t, viewer));
    if (!source || !canFork(source, viewer)) return { error: `There's no table called ${slug} you can fork. Use list_tables to find one.` };
    const [mine] = await sql`select a.handle from accounts a join users u on u.account_id = a.id where u.id = ${userId}`;
    const target = owner ?? (mine?.handle as string | undefined);
    if (!target || !viewer.accounts.includes(target)) return { error: "You can't add tables to that account." };
    const forked = await forkTable(sql, tables, source, target, title);
    if ("error" in forked) return forked;
    await refresh?.();
    return { ...forked, url: tableUrl(forked) };
  };

  /** Give a column an instruction, change it, or clear it with an empty one. */
  const setInstruction = async (slug: string, columnName: string, instruction: string, choices?: string[]) => {
    const found = await running(slug, { unquoted: true });
    if ("error" in found) return found;
    const { table } = found;
    const column = columnOf(table, columnName);
    if (!column) return { error: `There's no column ${columnName}.` };
    if (!proofOptional(table) && instruction.trim()) return { error: "An AI column needs a table whose proof is optional." };
    const ai = aiFields({ type: column.type, instruction, choices });
    await sql`update table_columns set instruction = ${ai.instruction ?? null}, choices = ${ai.choices ? sql.json(ai.choices) : null}
      where table_id = ${await tableId(table)} and id = ${column.id} and removed_at is null`;
    await refresh?.();
    const updated = tables.find((t) => t.owner === table.owner && t.slug === table.slug)!;
    const now = updated.columns.find((candidate) => candidate.id === column.id)!;
    return { column: column.id, ...(now.instruction ? { waiting: aiProgress(updated, now) } : { cleared: true }) };
  };

  /**
   * The next AI cells to answer: each row's prompt, with a fingerprint to send back with the answer.
   * Blank cells come first, then ones whose prompt changed. `redo` also takes generated values that
   * came from outside the instruction.
   */
  const nextAiCells = async (slug: string, columnName?: string, limit = MAX_CELLS_PER_CALL, redo = false) => {
    const found = await running(slug, { unquoted: true });
    if ("error" in found) return found;
    const { table } = found;
    const columns = table.columns.filter((column) => column.instruction && (!columnName || column.id === columnName || column.label.toLowerCase() === columnName.toLowerCase()));
    if (!columns.length) return { error: columnName ? `${columnName} isn't an AI column. Give it an instruction with set_instruction.` : "This table has no AI columns. Give one an instruction with set_instruction." };
    const wanted = (state: string | undefined, cell: Cell | undefined) =>
      state === "pending" || state === "stale" || (redo && state === "kept" && !!cell && isGiven(cell) && cell.origin === "generated");
    for (const column of columns) {
      const states = table.rows.map((row) => ({ row, state: aiCellState(table, column, row) })).filter(({ row, state }) => wanted(state, row.cells[column.id]));
      // Blanks first, then answers that went out of date.
      const open = [...states.filter(({ state }) => state === "pending"), ...states.filter(({ state }) => state !== "pending")].map(({ row }) => row);
      if (!open.length) continue;
      const batch = open.slice(0, Math.max(1, Math.min(limit, MAX_CELLS_PER_CALL)));
      return {
        column: column.id,
        label: column.label,
        type: column.type,
        instruction: column.instruction,
        ...(column.choices && { choices: column.choices }),
        remaining: open.length - batch.length,
        cells: batch.map((row) => {
          const { prompt, basis } = rowPrompt(table, column, row)!;
          return { row: row.key, prompt, basis };
        }),
        next: "Answer each prompt, then send the answers with fill_ai_cells, each with its row and basis.",
      };
    }
    const waiting = columns.reduce((sum, column) => sum + aiProgress(table, column).waiting, 0);
    return { done: true, ...(waiting && { waiting, note: `${waiting} rows are still blank in a column their prompt names, so they wait for that first.` }) };
  };

  /** Save answers to an AI column. Each needs the basis it was asked with, so an answer to a prompt that has since changed is refused. */
  const fillAiCells = async (slug: string, columnName: string, model: string, answers: AiAnswer[]) => {
    const found = await running(slug, { unquoted: true });
    if ("error" in found) return found;
    const { table } = found;
    const column = columnOf(table, columnName);
    if (!column?.instruction) return { error: `${columnName} isn't an AI column.` };
    const problems: Problem[] = [];
    const batch: { row: string; column: string; cell: Cell }[] = [];
    for (const answer of answers) {
      const row = table.rows.find((candidate) => candidate.key === answer.row);
      const made = row && rowPrompt(table, column, row);
      if (!row || !made) {
        problems.push({ row: answer.row, error: "There's no such row." });
        continue;
      }
      if (made.basis !== answer.basis) {
        problems.push({ row: answer.row, error: "This row or the instruction changed since you were asked. Get it again with next_ai_cells." });
        continue;
      }
      const choice = column.type === "text" ? matchChoice(column, answer.value) : answer.value;
      const value = choice === undefined ? undefined : asValue(column, choice);
      if (value === undefined) {
        problems.push({ row: answer.row, error: column.choices ? `Answer with one of: ${column.choices.join(", ")}.` : `Give a ${column.type === "text" ? "value" : column.type}.` });
        continue;
      }
      batch.push({ row: row.key, column: column.id, cell: { value, origin: "generated", note: column.instruction.slice(0, 500), model: model.trim().slice(0, 80) || "unknown", basis: made.basis, read: today() } });
    }
    // An AI column only writes over its own blanks and its own answers. Anything a person typed, linked or quoted stays.
    const refused = await saveGiven(table, batch, (held) => (!held || "missing" in held || (isGiven(held) && held.origin === "generated") ? undefined : "A person set this value, so the instruction leaves it alone."));
    for (const [index, error] of refused) problems.push({ row: batch[index]!.row, error });
    if (batch.length) await refresh?.();
    const updated = tables.find((t) => t.owner === table.owner && t.slug === table.slug)!;
    const progress = aiProgress(updated, updated.columns.find((candidate) => candidate.id === column.id)!);
    return { saved: answers.length - problems.length, of: answers.length, remaining: progress.pending + progress.stale, ...(problems.length && { errors: problems }) };
  };

  return { create, addColumns, addRows, fill, dataLink, version, fork, setInstruction, nextAiCells, fillAiCells };
}

export type AgentActions = ReturnType<typeof agentActions>;
