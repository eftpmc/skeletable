import { z } from "zod";

/**
 * A living table. Every cell either states a value with the page and exact words it came from, or
 * says it wasn't found and where we looked. A cell holds what a source states: nothing is computed
 * or inferred, so anyone can check it by opening the link.
 */
export const TABLE_FORMAT = 1;

const text = (max: number) => z.string().trim().min(1).max(max);
const url = z.string().url().max(2000);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const columnSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  label: text(80),
  type: z.enum(["text", "number", "boolean"]),
  unit: text(30).optional(),
  // What counts as this value, so two readers would fill it in the same way.
  rule: text(500),
});

/**
 * How close a value is to its origin: the owner's own live page, a dated public copy of that page
 * (for facts that don't change), or someone else's account of it. Readers and scores see the difference.
 */
export const sourceKinds = ["first-hand", "archived", "second-hand"] as const;

export const foundCellSchema = z.object({
  value: z.union([z.string().trim().min(1).max(300), z.number(), z.boolean()]),
  source: url,
  kind: z.enum(sourceKinds),
  // Copied word for word from the source, short enough to read at a glance.
  quote: text(400),
  read: day,
});

export const missingCellSchema = z.object({
  missing: z.literal(true),
  checked: z.array(url).min(1).max(10),
  read: day,
});

export const cellSchema = z.union([foundCellSchema, missingCellSchema]);

export const rowSchema = z.object({
  key: text(120),
  cells: z.record(z.string(), cellSchema),
});

export const tableSchema = z.object({
  format: z.literal(TABLE_FORMAT),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  title: text(120),
  question: text(300),
  // What belongs in the table and what doesn't. Completeness is judged against this.
  scope: text(800),
  columns: z.array(columnSchema).min(1).max(20),
  rows: z.array(rowSchema).min(1),
});

export type SourceKind = (typeof sourceKinds)[number];
export type Column = z.infer<typeof columnSchema>;
export type FoundCell = z.infer<typeof foundCellSchema>;
export type MissingCell = z.infer<typeof missingCellSchema>;
export type Cell = z.infer<typeof cellSchema>;
export type Row = z.infer<typeof rowSchema>;
export type Table = z.infer<typeof tableSchema>;

export const isFound = (cell: Cell): cell is FoundCell => !("missing" in cell);

/** Lowercase, plain punctuation and single spaces, so a quote survives a page's typography. */
export function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** Whether a number is written in its quote, with or without thousands separators. */
export function quoteStates(value: number, quote: string): boolean {
  const digits = normalize(quote).replace(/(\d),(?=\d{3})/g, "$1");
  const number = String(value).replace(".", "\\.");
  // 13.5 matches "13.50", and 2 matches "2.0", but 13 doesn't match "13.5" or 20 "120".
  const tail = number.includes(".") ? "0*" : "(?:\\.0+)?";
  return new RegExp(`(?<![\\d.])${number}${tail}(?![\\d.]*\\d)`).test(digits);
}

/** Problems a table has on its own, before any page is opened. Empty means it's well formed. */
export function validateTable(input: unknown): { table?: Table; problems: string[] } {
  const parsed = tableSchema.safeParse(input);
  if (!parsed.success) return { problems: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  const table = parsed.data;
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const row of table.rows) {
    if (seen.has(row.key)) problems.push(`${row.key}: appears twice`);
    seen.add(row.key);
    for (const id of Object.keys(row.cells)) {
      if (!table.columns.some((c) => c.id === id)) problems.push(`${row.key}.${id}: no such column`);
    }
    for (const column of table.columns) {
      const cell = row.cells[column.id];
      const at = `${row.key}.${column.id}`;
      if (!cell) {
        problems.push(`${at}: empty; say where you looked instead`);
      } else if (isFound(cell)) {
        const expected = column.type === "text" ? "string" : column.type;
        if (typeof cell.value !== expected) problems.push(`${at}: should be ${column.type}`);
        else if (typeof cell.value === "number" && !quoteStates(cell.value, cell.quote)) {
          problems.push(`${at}: ${cell.value} isn't in its quote`);
        }
      }
    }
  }
  return { table, problems };
}
