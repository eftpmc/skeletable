import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { isFound, normalize, validateTable, watchFileSchema, watchKey, type Cell, type Table, type WatchFile } from "@skeleton/tables/format";

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
    slug: table.slug,
    topic: table.topic,
    title: table.title,
    question: table.question,
    rows: table.rows.length,
    columns: table.columns.map((column) => column.label),
    filled: `${cells(table).filter(isFound).length} of ${cells(table).length} cells`,
    lastRead: lastRead(table),
    lastChecked: table.watch?.ran ?? lastRead(table),
  };
}

/** How each table's values stand, for showing it at a glance in a list. */
export function checkCounts(table: Table) {
  const counts = { confirmed: 0, summary: 0, once: 0, gap: 0 };
  for (const cell of cells(table)) {
    if (!isFound(cell)) counts.gap += 1;
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

const cellValue = (cell: Cell) => (isFound(cell) ? cell.value : null);

/** A table's values, with null where no acceptable source stated one. Evidence is one get_cell away. */
export function tableValues(table: Table) {
  return {
    owner: table.owner,
    slug: table.slug,
    title: table.title,
    question: table.question,
    scope: table.scope,
    lastRead: lastRead(table),
    columns: table.columns,
    rows: table.rows.map((row) => ({
      key: row.key,
      values: Object.fromEntries(table.columns.map((column) => [column.id, cellValue(row.cells[column.id]!)])),
    })),
  };
}

/** One cell with its evidence, or undefined if there is no such row or column. Matching ignores case. */
export function findCell(table: PublishedTable, rowKey: string, columnId: string) {
  const row = table.rows.find((r) => normalize(r.key) === normalize(rowKey));
  const column = table.columns.find((c) => c.id === columnId);
  const cell = column && row?.cells[column.id];
  if (!row || !column || !cell) return undefined;
  const watch = table.watch?.cells[watchKey(row.key, column.id)];
  return { owner: table.owner, table: table.slug, row: row.key, column, cell, ...(watch && { watch: { ...watch, ran: table.watch!.ran } }) };
}
