import type { Cell, Column } from "@skeleton/tables/format";
import { display } from "@/lib/cells";
import type { PublishedTable } from "@/lib/status";

export type SheetSort = { column: string; descending: boolean } | null;

/** The column that sorts by a row's own name. */
export const NAME_COLUMN = "__name";

const cellValue = (cell: Cell | undefined) => (!cell || "missing" in cell ? undefined : cell.value);

/** Rows that mention what you typed, in the row's name or any of its values. */
export function matchingRows(table: PublishedTable, find: string) {
  const words = find.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return table.rows;
  return table.rows.filter((row) => {
    const values = Object.values(row.cells).map(cellValue).filter((value) => value !== undefined).map((value) => display(value!));
    const text = [row.key, ...values].join(" ").toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

/** Rows in the chosen order. Empty cells always go last, whichever way it's sorted. */
export function sortedRows(table: PublishedTable, rows: PublishedTable["rows"], sort: SheetSort) {
  if (!sort) return rows;
  const direction = sort.descending ? -1 : 1;
  const column: Column | undefined = table.columns.find((c) => c.id === sort.column);
  const valueOf = (row: PublishedTable["rows"][number]) => (sort.column === NAME_COLUMN ? row.key : cellValue(row.cells[sort.column]));
  return [...rows].sort((a, b) => {
    const [x, y] = [valueOf(a), valueOf(b)];
    if (x === undefined || y === undefined) return x === y ? 0 : x === undefined ? 1 : -1;
    if (column?.type === "number") return ((x as number) - (y as number)) * direction;
    return String(x).localeCompare(String(y), undefined, { numeric: true }) * direction;
  });
}

/** The next step when you click a column: ascending, descending, then back to the table's own order. */
export function nextSort(sort: SheetSort, column: string): SheetSort {
  if (sort?.column !== column) return { column, descending: false };
  return sort.descending ? null : { column, descending: true };
}
