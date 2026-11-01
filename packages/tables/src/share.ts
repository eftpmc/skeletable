import { hasValue, isFound, proofOptional, type Cell, type Origin, type Table, type WatchFile } from "./format.js";

/** Small pure helpers the site and the server both use, so a table reads the same in both. */

const valued = (cell: Cell | undefined) => (cell && hasValue(cell) ? cell : undefined);

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

export type CellStatus = "fracture" | "gone" | "once" | "summary" | "confirmed" | "none" | "linked" | "generated" | "entered" | "imported" | "unproven" | "gap" | "blank";

export const statusLabels: Record<CellStatus, string> = {
  fracture: "Fracture",
  gone: "Quote gone",
  once: "Read once",
  summary: "Matched a summary",
  confirmed: "Confirmed",
  none: "None stated",
  linked: "Linked",
  generated: "Generated",
  entered: "Entered",
  imported: "Imported",
  unproven: "No proof yet",
  gap: "Not found",
  blank: "Not looked at yet",
};

/** The status of a value that says where it came from instead of quoting a source. */
export const originStatus: Record<Origin, CellStatus> = { link: "linked", generated: "generated", entered: "entered", imported: "imported" };

/** How far to trust a cell, worst news first. */
export const cellStatus = (cell: Cell, rowKey: string, columnId: string, watch?: WatchFile): CellStatus => {
  if ("origin" in cell) return originStatus[cell.origin];
  if ("missing" in cell) return cell.unproven !== undefined ? "unproven" : cell.absent ? "none" : cell.checked.length ? "gap" : "blank";
  if (cell.conflicts?.length) return "fracture";
  if (watch?.cells[`${rowKey}/${columnId}`]?.status === "not-on-page") return "gone";
  if (cell.confirmed === "blind-read") return "confirmed";
  return cell.confirmed === "summary" ? "summary" : "once";
};

/** A cell's lasting addresses: its proof, the bare value, the value with its proof as data, and a live card for other pages. */
export function cellPaths(table: { owner: string; slug: string; rows: { key: string }[] }, rowKey: string, columnId: string) {
  const row = rowSlugs(table).get(rowKey)!;
  const at = `${table.owner}/${table.slug}`;
  return { page: `/${at}/row/${row}#${columnId}`, value: `/data/${at}/${row}/${columnId}.csv`, data: `/data/${at}/${row}/${columnId}.json`, embed: `/embed/${at}/${row}/${columnId}` };
}

/** What an empty cell says: the source has no such value, we looked and couldn't find one, or nobody has looked. */
export const emptyLabel = (cell: Cell | undefined) => (cell && "missing" in cell && cell.absent ? "None stated" : cell && "missing" in cell && cell.checked.length ? "Not found" : "Not looked at yet");

const fragment = (text: string) => encodeURIComponent(text).replace(/-/g, "%2D");

/** A source's address that opens at its quote, highlighted, where the browser can. Elsewhere it's just the page. */
export function quoteLink(source: string, quote: string) {
  if (/\.pdf(?:$|[?#])/i.test(source)) return source;
  const words = quote.trim().split(/\s+/);
  const text = words.length > 12 ? `${fragment(words.slice(0, 5).join(" "))},${fragment(words.slice(-5).join(" "))}` : fragment(words.join(" "));
  return `${source}${source.includes("#") ? "" : "#"}:~:text=${text}`;
}

/** Text split around `[words](address)` links. Only web and site addresses become links. */
export function inlineParts(text: string) {
  const parts: { text: string; href?: string }[] = [];
  let at = 0;
  for (const match of text.matchAll(/\[([^\]]+)\]\(((?:https?:\/\/|\/)[^)\s]+)\)/g)) {
    if (match.index > at) parts.push({ text: text.slice(at, match.index) });
    parts.push({ text: match[1]!, href: match[2]! });
    at = match.index + match[0].length;
  }
  if (at < text.length) parts.push({ text: text.slice(at) });
  return parts;
}

/** What a draft still needs. Values with no proof don't hold up publishing: they're left out of it. */
export function draftChecklist(table: Pick<Table, "question" | "topic" | "scope" | "columns" | "rows" | "proof">) {
  const cells = table.rows.flatMap((row) => Object.values(row.cells));
  const unruled = table.columns.filter((column) => !column.rule).length;
  const proven = cells.filter((cell) => hasValue(cell) || cell.absent).length;
  return {
    items: [
      { label: "Say what question it answers", done: !!table.question },
      { label: "Give it a topic", done: !!table.topic },
      { label: "Say what belongs in it", done: !!table.scope },
      { label: unruled ? `Write what counts for ${unruled} ${unruled === 1 ? "column" : "columns"}` : "Write what counts for each column", done: !unruled },
      { label: proofOptional(table) ? "Fill at least one value" : "Prove at least one value", done: proven > 0 },
    ],
    unproven: cells.filter((cell) => "missing" in cell && cell.unproven !== undefined).length,
  };
}

/** A spreadsheet runs text starting with these as a formula, so a value from a page can't reach it as one. */
const safe = (text: string) => (/^[=+\-@\t\r]/.test(text) ? `'${text}` : text);

export const csvField = (value: string | number | boolean | undefined) => {
  if (value === undefined) return "";
  if (typeof value !== "string") return String(value);
  const text = safe(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export type CsvOptions = {
  // Only these columns, by id, in this order. Left out, every column.
  columns?: string[];
  // Whether the first column holds each row's name. Left out, it does.
  names?: boolean;
};

/**
 * The table as CSV. With proof, each column is followed by its source and quote, and in a table
 * whose proof is optional, by where each value came from.
 */
export function tableCsv(table: Pick<Table, "columns" | "rows" | "proof">, proof: boolean, { columns, names = true }: CsvOptions = {}) {
  const heading = (label: string, unit?: string) => (unit ? `${label} (${unit})` : label);
  const chosen = columns ? columns.flatMap((id) => table.columns.filter((column) => column.id === id)) : table.columns;
  const origins = proof && proofOptional(table);
  const header = [...(names ? ["Name"] : []), ...chosen.flatMap((column) => {
    const name = heading(column.label, column.unit);
    return proof ? [name, `${name}: source`, `${name}: quote`, ...(origins ? [`${name}: origin`] : [])] : [name];
  })];
  const lines = table.rows.map((row) => [
    ...(names ? [csvField(row.key)] : []),
    ...chosen.flatMap((column) => {
      const cell = valued(row.cells[column.id]);
      const quote = cell && isFound(cell) ? cell.quote : undefined;
      const origin = cell ? ("origin" in cell ? cell.origin : "quote") : undefined;
      return proof ? [csvField(cell?.value), csvField(cell?.source), csvField(quote), ...(origins ? [csvField(origin)] : [])] : [csvField(cell?.value)];
    }),
  ]);
  return [header.map(csvField), ...lines].map((line) => line.join(",")).join("\r\n");
}
