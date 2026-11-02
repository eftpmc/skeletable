import { hasValue, isFound, isGiven, normalize, type Cell, type Column, type Row, type Table } from "./format.js";

/**
 * What a column holds, at a glance: how full it is, where its values came from, and their shape.
 * A text column with a few repeated values is read as categories, like a label column.
 */
export type ColumnSummary = {
  filled: number;
  blank: number;
  // How each value was made: "quote", or a value's origin.
  origins: Record<string, number>;
} & (
  | { kind: "categories"; values: { value: string; count: number }[] }
  | { kind: "text"; shortest: number; longest: number; average: number; duplicates: number }
  | { kind: "number"; min: number; max: number; median: number; histogram: number[] }
  | { kind: "boolean"; yes: number; no: number }
  | { kind: "empty" }
);

// A text column reads as categories when its values repeat: few distinct ones, each used about twice or more.
const MAX_CATEGORIES = 20;
const HISTOGRAM_BINS = 8;

const valueOf = (cell: Cell | undefined) => (cell && hasValue(cell) ? cell.value : undefined);

export function columnSummary(table: Pick<Table, "rows">, column: Column): ColumnSummary {
  const cells = table.rows.map((row) => row.cells[column.id]);
  const values = cells.map(valueOf).filter((value) => value !== undefined);
  const origins: Record<string, number> = {};
  for (const cell of cells) {
    if (!cell || !hasValue(cell)) continue;
    const origin = isFound(cell) ? "quote" : cell.origin;
    origins[origin] = (origins[origin] ?? 0) + 1;
  }
  const base = { filled: values.length, blank: cells.length - values.length, origins };
  if (!values.length) return { ...base, kind: "empty" };
  if (column.type === "boolean") return { ...base, kind: "boolean", yes: values.filter((value) => value === true).length, no: values.filter((value) => value === false).length };
  if (column.type === "number") {
    const numbers = (values as number[]).slice().sort((a, b) => a - b);
    const [min, max] = [numbers[0]!, numbers.at(-1)!];
    const middle = numbers.length / 2;
    const median = numbers.length % 2 ? numbers[Math.floor(middle)]! : (numbers[middle - 1]! + numbers[middle]!) / 2;
    const histogram = Array<number>(HISTOGRAM_BINS).fill(0);
    for (const number of numbers) histogram[max === min ? 0 : Math.min(HISTOGRAM_BINS - 1, Math.floor(((number - min) / (max - min)) * HISTOGRAM_BINS))]! += 1;
    return { ...base, kind: "number", min, max, median, histogram };
  }
  const texts = values as string[];
  const counts = new Map<string, number>();
  for (const text of texts) counts.set(text, (counts.get(text) ?? 0) + 1);
  if (counts.size <= MAX_CATEGORIES && counts.size * 2 <= texts.length) {
    const sorted = [...counts].sort(([a, x], [b, y]) => y - x || a.localeCompare(b));
    return { ...base, kind: "categories", values: sorted.map(([value, count]) => ({ value, count })) };
  }
  const lengths = texts.map((text) => text.length);
  return {
    ...base,
    kind: "text",
    shortest: Math.min(...lengths),
    longest: Math.max(...lengths),
    average: Math.round(lengths.reduce((sum, length) => sum + length, 0) / lengths.length),
    duplicates: texts.length - counts.size,
  };
}

/** Every column's summary, by column id. */
export const tableSummaries = (table: Pick<Table, "rows" | "columns">) => Object.fromEntries(table.columns.map((column) => [column.id, columnSummary(table, column)]));

/** A short fingerprint of a prompt, the same on the server and in the browser. */
export function fingerprint(text: string) {
  // cyrb53: fast and well spread. It only has to notice a change, not resist one.
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

const display = (value: string | number | boolean) => (typeof value === "boolean" ? (value ? "Yes" : "No") : String(value));

/**
 * An AI column's instruction for one row: each {Column} it names, by label or id, becomes that row's
 * value, and {Name} becomes the row's name. `waiting` means a column it names is still blank there.
 */
export function rowPrompt(table: Pick<Table, "columns">, column: Column, row: Row) {
  if (!column.instruction) return undefined;
  let waiting = false;
  const text = column.instruction.replace(/\{([^{}]{1,80})\}/g, (whole, name: string) => {
    const wanted = normalize(name);
    if (wanted === "name") return row.key;
    const source = table.columns.find((candidate) => candidate.id !== column.id && (normalize(candidate.label) === wanted || candidate.id === wanted));
    if (!source) return whole;
    const value = valueOf(row.cells[source.id]);
    if (value === undefined) {
      waiting = true;
      return "";
    }
    return display(value);
  });
  const choices = column.choices?.length ? `\nAnswer with exactly one of: ${column.choices.join(", ")}.` : "";
  const prompt = `${text}${choices}`;
  return { prompt, basis: fingerprint(prompt), waiting };
}

export type AiCellState = "done" | "pending" | "stale" | "waiting" | "kept";

/**
 * Where one AI cell stands. A blank cell is `pending`, and a generated one is `stale` once its prompt
 * has changed. A value a person typed, linked or quoted is `kept`: the instruction never overwrites it.
 * A generated value with no fingerprint came from outside the instruction, so it's kept too.
 */
export function aiCellState(table: Pick<Table, "columns">, column: Column, row: Row): AiCellState | undefined {
  const made = rowPrompt(table, column, row);
  if (!made) return undefined;
  const cell = row.cells[column.id];
  if (cell && hasValue(cell)) {
    if (!isGiven(cell) || cell.origin !== "generated" || !cell.basis) return "kept";
    if (cell.basis === made.basis) return "done";
    return made.waiting ? "waiting" : "stale";
  }
  return made.waiting ? "waiting" : "pending";
}

/** How an AI column stands across its rows. */
export function aiProgress(table: Pick<Table, "columns" | "rows">, column: Column) {
  const counts: Record<AiCellState, number> = { done: 0, pending: 0, stale: 0, waiting: 0, kept: 0 };
  for (const row of table.rows) {
    const state = aiCellState(table, column, row);
    if (state) counts[state] += 1;
  }
  return counts;
}

/** The answer an AI column takes for this text, matched to its choices ignoring case, or undefined when it isn't one. */
export function matchChoice(column: Column, answer: string) {
  if (!column.choices?.length) return answer.trim();
  const wanted = normalize(answer).replace(/[.!]+$/, "");
  return column.choices.find((choice) => normalize(choice) === wanted);
}
