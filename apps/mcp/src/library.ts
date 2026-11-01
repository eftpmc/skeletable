import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { hasValue, isAnswered, isFound, isGiven, normalize, quoteStates, validateTable, watchFileSchema, watchKey, type Cell, type Column, type Table, type WatchFile } from "@skeleton/tables/format";
import { cellPaths, cellStatus } from "@skeleton/tables/share";

/** A table as served, with what the last watch saw, if it's been watched, and its team's name if a team runs it. A private one must only go out through the rule in access.ts. */
export type PublishedTable = Table & { watch?: WatchFile; ownerName?: string; private?: boolean; managed?: boolean; moved?: Record<string, string> };

/** Every published table, read once at start. A table that doesn't pass its checks stops the server rather than going out unchecked. */
export async function loadTables(dir: string): Promise<PublishedTable[]> {
  const files = (await readdir(dir)).filter((file) => file.endsWith(".json")).sort();
  const tables: PublishedTable[] = [];
  for (const file of files) {
    const { table, problems } = validateTable(JSON.parse(await readFile(join(dir, file), "utf8")));
    if (!table || problems.length) throw new Error(`${file}: ${problems.join("; ")}`);
    const watch = await readFile(join(dir, "watch", `${table.slug}.json`), "utf8").then((text) => watchFileSchema.parse(JSON.parse(text)), noWatchYet);
    tables.push(watch ? { ...table, watch } : table);
  }
  return tables;
}

/** A table that's never been watched is fine. A watch file that's there and broken still stops the server. */
function noWatchYet(error: NodeJS.ErrnoException) {
  if (error.code === "ENOENT") return undefined;
  throw error;
}

const cells = (table: Table) => table.rows.flatMap((row) => Object.values(row.cells));

/** The newest day any cell in the table was read. */
export const lastRead = (table: Table) => cells(table).reduce((latest, cell) => (cell.read > latest ? cell.read : latest), "");

/** What a reader needs to choose a table, without its rows. */
export function summarize(table: PublishedTable) {
  return {
    owner: table.owner,
    ...(table.ownerName && { ownerName: table.ownerName }),
    ...(table.private && { private: true }),
    ...(table.draft && { draft: true }),
    slug: table.slug,
    topic: table.topic,
    title: table.title,
    question: table.question,
    ...(table.proof === "optional" && { proof: "optional" }),
    rows: table.rows.length,
    columns: table.columns.map((column) => column.label),
    filled: `${cells(table).filter(isAnswered).length} of ${cells(table).length} cells`,
    lastRead: lastRead(table),
    lastChecked: table.watch?.ran ?? lastRead(table),
  };
}

/** How each table's values stand, for showing it at a glance in a list. */
export function checkCounts(table: Table) {
  const counts = { confirmed: 0, summary: 0, once: 0, given: 0, gap: 0 };
  for (const cell of cells(table)) {
    if (isGiven(cell)) counts.given += 1;
    else if (!isFound(cell)) counts.gap += 1;
    else if (cell.confirmed === "blind-read") counts.confirmed += 1;
    else if (cell.confirmed === "summary") counts.summary += 1;
    else counts.once += 1;
  }
  return counts;
}

/** Tables with every word of the query somewhere in their text or rows. No query means all of them. */
export function searchTables(tables: Table[], query = ""): Table[] {
  const words = normalize(query).split(" ").filter(Boolean);
  return tables.filter((table) => {
    const text = normalize([table.slug, table.title, table.question, ...table.columns.map((c) => c.label), ...table.rows.map((r) => r.key)].join(" "));
    return words.every((word) => text.includes(word));
  });
}

const cellValue = (cell: Cell) => (hasValue(cell) ? cell.value : null);

/**
 * A table's values, with null where no acceptable source stated one. Evidence is one get_cell away.
 * In a table whose proof is optional, `origins` says where each value without a quote came from.
 */
export function tableValues(table: Table) {
  return {
    owner: table.owner,
    slug: table.slug,
    title: table.title,
    question: table.question,
    scope: table.scope,
    proof: table.proof ?? "required",
    lastRead: lastRead(table),
    columns: table.columns,
    rows: table.rows.map((row) => {
      const origins = Object.fromEntries(table.columns.flatMap((column) => {
        const cell = row.cells[column.id]!;
        return isGiven(cell) ? [[column.id, cell.origin]] : [];
      }));
      return {
        key: row.key,
        values: Object.fromEntries(table.columns.map((column) => [column.id, cellValue(row.cells[column.id]!)])),
        ...(Object.keys(origins).length && { origins }),
      };
    }),
  };
}

/** Whether a claimed value says the same thing as a stated one. A text value may be a shorter or longer wording of it. */
function agrees(column: Column, stated: string | number | boolean, claim: string) {
  const text = normalize(claim);
  if (typeof stated === "number") return quoteStates(stated, text);
  if (typeof stated === "boolean") return stated ? /^(yes|true)\b/.test(text) : /^(no|false)\b/.test(text);
  const value = normalize(stated);
  return column.type === "text" && !!text && (value.includes(text) || text.includes(value));
}

/**
 * Test a claim against a cell, with nothing inferred: `matches` and `differs` come with the words to
 * judge it by, and `unknown` means the table can't say. A fracture never gets a plain match.
 */
export function checkClaim(table: PublishedTable, rowKey: string, columnId: string, claim: string, publicUrl: string) {
  const found = findCell(table, rowKey, columnId, publicUrl);
  if (!found) return undefined;
  const { cell, column, url } = found;
  const status = cellStatus(cell, found.row, column.id, table.watch);
  const shared = { row: found.row, column: column.label, unit: column.unit, status, url };
  if (isGiven(cell)) {
    const { value: stated, origin, source, note, read } = cell;
    return { verdict: agrees(column, stated, claim) ? "matches" : "differs", ...shared, stated, origin, ...(source && { source }), ...(note && { note }), read, caution: "This value has no quote, so check where it came from before relying on it." };
  }
  if ("missing" in cell) return { verdict: cell.absent ? "differs" : "unknown", ...shared, ...(cell.absent ? { stated: null, note: "The source was read and gives no such value.", source: cell.checked[0] } : { note: "No acceptable source stated this, so the table can't say." }) };
  const { value: stated, quote, source, read, conflicts } = cell;
  const verdict = conflicts?.length ? "disputed" : agrees(column, stated, claim) ? "matches" : "differs";
  return { verdict, ...shared, stated, quote, source, read, ...(conflicts && { conflicts }) };
}

/** One cell with its evidence and its lasting address, or undefined if there is no such row or column. Matching ignores case. */
export function findCell(table: PublishedTable, rowKey: string, columnId: string, publicUrl: string) {
  const row = table.rows.find((r) => normalize(r.key) === normalize(rowKey));
  const column = table.columns.find((c) => c.id === columnId);
  const cell = column && row?.cells[column.id];
  if (!row || !column || !cell) return undefined;
  const watch = table.watch?.cells[watchKey(row.key, column.id)];
  return { owner: table.owner, table: table.slug, row: row.key, column, cell, url: `${publicUrl}${cellPaths(table, row.key, column.id).page}`, ...(watch && { watch: { ...watch, ran: table.watch!.ran } }) };
}
