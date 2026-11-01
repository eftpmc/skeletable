import type { Cell, Table } from "./format.js";

/** Small pure helpers the site and the server both use, so a table reads the same in both. */

const found = (cell: Cell | undefined) => (cell && !("missing" in cell) ? cell : undefined);

export const displayValue = (value: string | number | boolean) => (typeof value === "boolean" ? (value ? "Yes" : "No") : String(value));

export const slugOfRow = (key: string) => key.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Each row's address within its table. Two names that read the same get a number, in table order. */
export function rowSlugs(table: { rows: { key: string }[] }) {
  const used = new Map<string, number>();
  return new Map(table.rows.map((row) => {
    const base = slugOfRow(row.key) || "row";
    const count = (used.get(base) ?? 0) + 1;
    used.set(base, count);
    return [row.key, count > 1 ? `${base}-${count}` : base] as const;
  }));
}

/** A spreadsheet runs text starting with these as a formula, so a value from a page can't reach it as one. */
const safe = (text: string) => (/^[=+\-@\t\r]/.test(text) ? `'${text}` : text);

const field = (value: string | number | boolean | undefined) => {
  if (value === undefined) return "";
  if (typeof value !== "string") return String(value);
  const text = safe(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** The table as CSV. With proof, each column is followed by its source and quote. */
export function tableCsv(table: Pick<Table, "columns" | "rows">, proof: boolean) {
  const heading = (label: string, unit?: string) => (unit ? `${label} (${unit})` : label);
  const header = ["Name", ...table.columns.flatMap((column) => {
    const name = heading(column.label, column.unit);
    return proof ? [name, `${name}: source`, `${name}: quote`] : [name];
  })];
  const lines = table.rows.map((row) => [
    field(row.key),
    ...table.columns.flatMap((column) => {
      const cell = found(row.cells[column.id]);
      return proof ? [field(cell?.value), field(cell?.source), field(cell?.quote)] : [field(cell?.value)];
    }),
  ]);
  return [header.map(field), ...lines].map((line) => line.join(",")).join("\r\n");
}
