import { z } from "zod";

/**
 * A living table. Every value knows where it came from. In a table that requires proof, every cell
 * either states a value with the page and exact words it came from, or says it wasn't found and where
 * we looked, so anyone can check it by opening the link. A table whose proof is optional can also hold
 * values that came from somewhere else, such as a link, a person or a model, and each says which.
 */
export const TABLE_FORMAT = 1;

const text = (max: number) => z.string().trim().min(1).max(max);
const url = z.string().url().max(2000);
export const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const columnSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  label: text(80),
  type: z.enum(["text", "number", "boolean"]),
  unit: text(30).optional(),
  // What counts as this value, so two readers would fill it in the same way. Only a draft can leave it empty.
  rule: z.string().trim().max(500),
  // An AI column: what a model is asked for each row, naming other columns in braces, like "Classify {Pitch}".
  instruction: z.string().trim().min(1).max(1000).optional(),
  // The only answers an AI column takes, when it has a fixed set.
  choices: z.array(z.string().trim().min(1).max(80)).min(1).max(50).optional(),
});

/**
 * How close a value is to its origin: the owner's own live page, a dated public copy of that page
 * (for facts that don't change), or someone else's account of it. Readers and scores see the difference.
 */
export const sourceKinds = ["first-hand", "archived", "second-hand"] as const;

/**
 * How a second reader backed a value up: `blind-read` means a separate reader opened the source
 * without seeing our value, and `summary` means it matched a summary of the owner's pages, which is
 * weaker. A cell without this has been read once.
 */
export const confirmations = ["blind-read", "summary"] as const;

const statedSchema = z.object({
  value: z.union([z.string().trim().min(1).max(300), z.number(), z.boolean()]),
  source: url,
  kind: z.enum(sourceKinds),
  // Copied word for word from the source, short enough to read at a glance.
  quote: text(400),
  read: day,
});

export const foundCellSchema = statedSchema.extend({
  confirmed: z.enum(confirmations).optional(),
  // What other sources state instead. Each is read and quoted like the value itself, and the rule for choosing is the column's.
  conflicts: z.array(statedSchema).min(1).max(5).optional(),
  // What the cell used to say, and the last day it stood.
  history: z.array(statedSchema.extend({ until: day })).max(50).optional(),
});

export const missingCellSchema = z.object({
  missing: z.literal(true),
  // Empty when a new table hasn't been filled in yet, so nobody has looked anywhere.
  checked: z.array(url).max(10),
  read: day,
  // The source was read in full and gives no such value, which is an answer rather than a gap.
  absent: z.literal(true).optional(),
  // A value typed or pasted into a draft, with no proof yet. It never counts and never gets published.
  unproven: z.union([z.string().trim().min(1).max(300), z.number(), z.boolean()]).optional(),
});

/**
 * Where a value without a quote came from: a page it links to, a model that wrote or labeled it, a
 * person who typed it, or a file it was imported from. Only a table whose proof is optional holds these.
 */
export const origins = ["link", "generated", "entered", "imported"] as const;

/** The longest text a value without a quote can hold, so a table can hold passages, not just facts. */
export const MAX_GIVEN_TEXT = 2000;

export const givenCellSchema = z.object({
  value: z.union([z.string().trim().min(1).max(MAX_GIVEN_TEXT), z.number(), z.boolean()]),
  origin: z.enum(origins),
  // The page it came from. A `link` value needs one.
  source: url.optional(),
  // How it was made: the prompt that generated it, or the file it was imported from.
  note: z.string().trim().min(1).max(500).optional(),
  // The model that wrote it, when one did.
  model: z.string().trim().min(1).max(80).optional(),
  // For an AI column, a fingerprint of the prompt it answered, so a change to the row or the instruction shows it's out of date.
  basis: z.string().regex(/^[0-9a-f]{1,32}$/).optional(),
  // The day it was set.
  read: day,
});

export const cellSchema = z.union([foundCellSchema, missingCellSchema, givenCellSchema]);

export const rowSchema = z.object({
  key: text(120),
  cells: z.record(z.string(), cellSchema),
});

/**
 * What the last watch saw for each cell, kept beside the table so watching never rewrites it.
 * `pinned` is an archived copy, which can't change. `seen` is the last day the quote was on the page.
 */
export const watchEntrySchema = z.object({
  status: z.enum(["found", "not-on-page", "unreadable", "robots", "pinned"]),
  seen: day.optional(),
});

export const watchFileSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  ran: day,
  cells: z.record(z.string(), watchEntrySchema),
});

export type WatchEntry = z.infer<typeof watchEntrySchema>;
export type WatchFile = z.infer<typeof watchFileSchema>;

export const watchKey = (rowKey: string, columnId: string) => `${rowKey}/${columnId}`;

export const tableSchema = z.object({
  format: z.literal(TABLE_FORMAT),
  // The account the table belongs to. A table's address is its owner and slug.
  owner: z.string().regex(/^[a-z0-9-]+$/),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  // Still being built, so only its people can see it, and its details can wait until it's published.
  draft: z.boolean().optional(),
  // Whether a value needs a quote. Left out, it does. `optional` lets values say where they came from instead.
  proof: z.enum(["required", "optional"]).optional(),
  // A broad subject, for browsing.
  topic: z.string().trim().max(40),
  title: text(120),
  question: z.string().trim().max(300),
  // What belongs in the table and what doesn't. Completeness is judged against this.
  scope: z.string().trim().max(800),
  columns: z.array(columnSchema).max(20),
  rows: z.array(rowSchema),
});

export type SourceKind = (typeof sourceKinds)[number];
export type Column = z.infer<typeof columnSchema>;
export type FoundCell = z.infer<typeof foundCellSchema>;
export type MissingCell = z.infer<typeof missingCellSchema>;
export type GivenCell = z.infer<typeof givenCellSchema>;
export type Origin = (typeof origins)[number];
export type Cell = z.infer<typeof cellSchema>;
export type Row = z.infer<typeof rowSchema>;
export type Table = z.infer<typeof tableSchema>;

/** Whether a cell states a value with its source and exact quote. */
export const isFound = (cell: Cell): cell is FoundCell => !("missing" in cell) && !("origin" in cell);

/** Whether a cell holds a value that says where it came from instead of quoting a source. */
export const isGiven = (cell: Cell): cell is GivenCell => "origin" in cell;

/** Whether a cell holds a value at all, quoted or not. */
export const hasValue = (cell: Cell): cell is FoundCell | GivenCell => !("missing" in cell);

/** Whether a table lets values go without a quote. */
export const proofOptional = (table: { proof?: "required" | "optional" }) => table.proof === "optional";

/** Whether a cell is settled: it holds a value, or its source was read and has none. */
export const isAnswered = (cell: Cell) => hasValue(cell) || !!cell.absent;

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

const SMALL_NUMBERS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** A whole number below a million in words, the way laws write them: "forty-five", "one thousand". */
function spelled(value: number): string | undefined {
  if (!Number.isInteger(value) || value < 1 || value > 999_999) return undefined;
  if (value >= 1000) {
    const remainder = value % 1000;
    return [`${spelled(Math.floor(value / 1000))} thousand`, remainder ? spelled(remainder) : ""].filter(Boolean).join(" ");
  }
  const rest = value % 100;
  const under100 = rest < 20 ? SMALL_NUMBERS[rest]! : [TENS[Math.floor(rest / 10)]!, SMALL_NUMBERS[rest % 10]!].filter(Boolean).join("-");
  const hundreds = Math.floor(value / 100);
  return [hundreds ? `${SMALL_NUMBERS[hundreds]} hundred` : "", under100].filter(Boolean).join(" ");
}

/** Whether a number is written in its quote, in digits or words, with or without thousands separators. */
export function quoteStates(value: number, quote: string): boolean {
  const digits = normalize(quote).replace(/(\d),(?=\d{3})/g, "$1");
  const number = String(value).replace(".", "\\.");
  // 13.5 matches "13.50", and 2 matches "2.0", but 13 doesn't match "13.5" or 20 "120".
  const tail = number.includes(".") ? "0*" : "(?:\\.0+)?";
  if (new RegExp(`(?<![\\d.])${number}${tail}(?![\\d.]*\\d)`).test(digits)) return true;
  const words = spelled(value);
  // "thirty" doesn't match "thirty-five" or "two hundred thirty", which are other numbers.
  return !!words && new RegExp(`(?<![a-z-])(?<!(?:hundred|thousand) )(?<!hundred and )${words}(?![a-z-])(?! (?:hundred|thousand))`).test(digits);
}

const LINKING_WORDS = new Set(["a", "an", "and", "at", "in", "of", "or", "per", "the", "to", "with"]);

/** The words in a text value its quote doesn't have. A value may only say what its source says. */
export function wordsBeyondQuote(value: string, quote: string): string[] {
  const words = (normalize(value).match(/[a-z0-9.]+/g) ?? []).map((word) => word.replace(/\.+$/, "")).filter((word) => word && !LINKING_WORDS.has(word));
  const source = normalize(quote);
  return words.filter((word) => !source.includes(word));
}

/** Why a value isn't the kind its column holds, if it isn't. */
function typeProblem(column: Column, value: FoundCell["value"] | GivenCell["value"]): string | undefined {
  const expected = column.type === "text" ? "string" : column.type;
  if (typeof value !== expected) return `should be ${column.type}`;
}

/** Why a stated value doesn't fit its column or its quote, if it doesn't. */
function valueProblem(column: Column, value: FoundCell["value"], quote: string): string | undefined {
  const wrongType = typeProblem(column, value);
  if (wrongType) return wrongType;
  if (typeof value === "number" && !quoteStates(value, quote)) return `${value} isn't in its quote`;
  if (typeof value === "string") {
    const beyond = wordsBeyondQuote(value, quote);
    if (beyond.length) return `says more than its quote (${beyond.join(", ")})`;
  }
}

/** Problems a table has on its own, before any page is opened. Empty means it's well formed. */
export function validateTable(input: unknown): { table?: Table; problems: string[] } {
  const parsed = tableSchema.safeParse(input);
  if (!parsed.success) return { problems: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  const table = parsed.data;
  const problems: string[] = [];
  if (!table.draft) {
    for (const field of ["topic", "question", "scope"] as const) if (!table[field]) problems.push(`${field}: empty`);
    for (const column of table.columns) if (!column.rule) problems.push(`${column.id}: has no rule`);
    if (!table.columns.length || !table.rows.length) problems.push("needs at least one column and one row");
  }
  for (const column of table.columns) {
    if (column.instruction && !proofOptional(table)) problems.push(`${column.id}: has an instruction, and this table requires proof`);
    if (column.choices && column.type !== "text") problems.push(`${column.id}: only a text column can have choices`);
  }
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
      } else if (isGiven(cell)) {
        if (!proofOptional(table)) problems.push(`${at}: has no quote, and this table requires one`);
        const problem = typeProblem(column, cell.value);
        if (problem) problems.push(`${at}: ${problem}`);
        if (cell.origin === "link" && !cell.source) problems.push(`${at}: comes from a link but doesn't give it`);
      } else if (isFound(cell)) {
        for (const stated of [cell, ...(cell.conflicts ?? []), ...(cell.history ?? [])]) {
          const problem = valueProblem(column, stated.value, stated.quote);
          if (problem) problems.push(`${at}: ${problem}`);
        }
      } else if (cell.absent && !cell.checked.length) {
        problems.push(`${at}: says its source has no value, without naming the source`);
      } else if (cell.unproven !== undefined && !table.draft) {
        problems.push(`${at}: has a value with no proof`);
      }
    }
  }
  return { table, problems };
}
