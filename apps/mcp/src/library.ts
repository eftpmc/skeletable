import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { isFound, normalize, validateTable, type Cell, type Table } from "@skeleton/tables/format";

/** Every published table, read once at start. A table that doesn't pass its checks stops the server rather than going out unchecked. */
export async function loadTables(dir: string): Promise<Table[]> {
  const files = (await readdir(dir)).filter((file) => file.endsWith(".json")).sort();
  const tables: Table[] = [];
  for (const file of files) {
    const { table, problems } = validateTable(JSON.parse(await readFile(join(dir, file), "utf8")));
    if (!table || problems.length) throw new Error(`${file}: ${problems.join("; ")}`);
    tables.push(table);
  }
  return tables;
}

const cells = (table: Table) => table.rows.flatMap((row) => Object.values(row.cells));

/** The newest day any cell in the table was read. */
const lastRead = (table: Table) => cells(table).reduce((latest, cell) => (cell.read > latest ? cell.read : latest), "");

/** What a reader needs to choose a table, without its rows. */
export function summarize(table: Table) {
  return {
    slug: table.slug,
    title: table.title,
    question: table.question,
    rows: table.rows.length,
    columns: table.columns.map((column) => column.label),
    filled: `${cells(table).filter(isFound).length} of ${cells(table).length} cells`,
    lastRead: lastRead(table),
  };
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
export function findCell(table: Table, rowKey: string, columnId: string) {
  const row = table.rows.find((r) => normalize(r.key) === normalize(rowKey));
  const column = table.columns.find((c) => c.id === columnId);
  const cell = column && row?.cells[column.id];
  return row && column && cell ? { table: table.slug, row: row.key, column, cell } : undefined;
}
