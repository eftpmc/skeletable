import type { Cell } from "@skeleton/tables/format";
import type { PublishedTable } from "@/lib/status";

const found = (cell: Cell | undefined) => (cell && !("missing" in cell) ? cell : undefined);

/** A spreadsheet runs text starting with these as a formula, so a value from a page can't reach it as one. */
const safe = (text: string) => (/^[=+\-@\t\r]/.test(text) ? `'${text}` : text);

const field = (value: string | number | boolean | undefined) => {
  if (value === undefined) return "";
  if (typeof value !== "string") return String(value);
  const text = safe(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** The table as you see it. With proof, each column is followed by its source and quote. */
export function tableCsv(table: PublishedTable, proof: boolean) {
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

/** The table's own data, with its address so a copy can credit where it came from. */
export function tableJson(table: PublishedTable, url: string) {
  const { watch: _watch, managed: _managed, ...data } = table;
  return JSON.stringify({ ...data, url, licence: table.private ? undefined : "CC BY 4.0" }, null, 2);
}

/** Hand the browser a file to save. */
export function saveFile(name: string, type: string, text: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type }));
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}
