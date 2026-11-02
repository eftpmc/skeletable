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

/** The values picked for each column. A row needs one of them in every filtered column. */
export type SheetFilters = Record<string, string[]>;

/** How a sheet is being looked at. It lives in the address, so a copied link opens the same view of the live table. */
export type SheetView = { sort: SheetSort; find: string; filters: SheetFilters; mode?: "board" | "upcoming"; by?: string };

/** The filter choice for a cell with no value. */
export const BLANK = "__blank";

const filterValue = (cell: Cell | undefined) => {
  const value = cellValue(cell);
  return value === undefined ? BLANK : String(value);
};

export function readView(search: string): SheetView {
  const params = new URLSearchParams(search);
  const column = params.get("sort");
  const filters: SheetFilters = {};
  for (const filter of params.getAll("f")) {
    const split = filter.indexOf(":");
    if (split > 0) (filters[filter.slice(0, split)] ??= []).push(filter.slice(split + 1));
  }
  const mode = params.get("view");
  return {
    sort: column ? { column, descending: params.has("desc") } : null,
    find: params.get("find") ?? "",
    filters,
    ...((mode === "board" || mode === "upcoming") && { mode }),
    ...(params.get("by") && { by: params.get("by")! }),
  };
}

/** The address's search text for a view and a selected cell. */
export function viewSearch({ sort, find, filters, mode, by }: SheetView, cell?: string | null) {
  const params = new URLSearchParams();
  if (mode) params.set("view", mode);
  if (mode && by) params.set("by", by);
  if (sort) params.set("sort", sort.column);
  if (sort?.descending) params.set("desc", "1");
  if (find) params.set("find", find);
  for (const [column, values] of Object.entries(filters)) for (const value of values) params.append("f", `${column}:${value}`);
  if (cell) params.set("cell", cell);
  const search = params.toString();
  return search ? `?${search}` : "";
}

/** Rows that fit the filters. A column the table no longer has is ignored, so an old link still opens. */
export function filteredRows(table: PublishedTable, rows: PublishedTable["rows"], filters: SheetFilters) {
  const active = table.columns.filter((column) => filters[column.id]?.length);
  return rows.filter((row) => active.every((column) => filters[column.id]!.includes(filterValue(row.cells[column.id]))));
}

/** What a column can be filtered to, with how many rows hold each value. Blanks go last. */
export function filterChoices(table: PublishedTable, columnId: string) {
  const column = table.columns.find((c) => c.id === columnId);
  const counts = new Map<string, { value: string; label: string; count: number }>();
  for (const row of table.rows) {
    const cell = row.cells[columnId];
    const value = filterValue(cell);
    const shown = cellValue(cell);
    const label = shown === undefined ? "No value" : display(shown);
    counts.set(value, { value, label, count: (counts.get(value)?.count ?? 0) + 1 });
  }
  return [...counts.values()].sort((a, b) => {
    if (a.value === BLANK || b.value === BLANK) return a.value === b.value ? 0 : a.value === BLANK ? 1 : -1;
    return column?.type === "number" ? Number(a.value) - Number(b.value) : a.label.localeCompare(b.label, undefined, { numeric: true });
  });
}
