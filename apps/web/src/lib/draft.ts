/** A table before it exists: its first row is the headings, and its first column the row names. */
export type Draft = string[][];

const MAX_COLUMNS = 20;
const MAX_ROWS = 200;

export const blankDraft = (): Draft => [["Name", "", "", ""], ...Array.from({ length: 5 }, () => ["", "", "", ""])];

const usStates = "Alabama,Alaska,Arizona,Arkansas,California,Colorado,Connecticut,Delaware,District of Columbia,Florida,Georgia,Hawaii,Idaho,Illinois,Indiana,Iowa,Kansas,Kentucky,Louisiana,Maine,Maryland,Massachusetts,Michigan,Minnesota,Mississippi,Missouri,Montana,Nebraska,Nevada,New Hampshire,New Jersey,New Mexico,New York,North Carolina,North Dakota,Ohio,Oklahoma,Oregon,Pennsylvania,Rhode Island,South Carolina,South Dakota,Tennessee,Texas,Utah,Vermont,Virginia,Washington,West Virginia,Wisconsin,Wyoming";
const euCountries = "Austria,Belgium,Bulgaria,Croatia,Cyprus,Czechia,Denmark,Estonia,Finland,France,Germany,Greece,Hungary,Ireland,Italy,Latvia,Lithuania,Luxembourg,Malta,Netherlands,Poland,Portugal,Romania,Slovakia,Slovenia,Spain,Sweden";

/** Lists of rows a lot of tables start from. */
export const rowSets = [
  { label: "US states and DC", rows: usStates.split(",") },
  { label: "EU countries", rows: euCountries.split(",") },
];

const splitCsvLine = (line: string) => [...line.matchAll(/("(?:[^"]|"")*"|[^,]*)(?:,|$)/g)].slice(0, -1).map(([, field]) => field!.replace(/^"|"$/g, "").replace(/""/g, '"'));

/** Text from a spreadsheet, which copies as tabs, or from a CSV file. */
export function parsePaste(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n");
  const separated = text.includes("\t") ? (line: string) => line.split("\t") : lines.length > 1 && lines.every((line) => line.includes(",")) ? splitCsvLine : (line: string) => [line];
  return lines.map((line) => separated(line).map((cell) => cell.trim()));
}

/** A draft with text pasted in at one cell, grown to fit. The Name heading stays as it is. */
export function pasteInto(draft: Draft, text: string, atRow: number, atColumn: number): Draft {
  const pasted = parsePaste(text);
  const width = Math.min(Math.max(draft[0]!.length, atColumn + Math.max(...pasted.map((line) => line.length))), MAX_COLUMNS + 1);
  const height = Math.min(Math.max(draft.length, atRow + pasted.length), MAX_ROWS + 1);
  const next = Array.from({ length: height }, (_, row) => Array.from({ length: width }, (_, column) => draft[row]?.[column] ?? ""));
  pasted.forEach((line, rowOffset) => {
    line.forEach((cell, columnOffset) => {
      const [row, column] = [atRow + rowOffset, atColumn + columnOffset];
      if (row < height && column < width && !(row === 0 && column === 0)) next[row]![column] = cell;
    });
  });
  return next;
}

/** The kind of column a list of values makes. Anything mixed stays text. */
export function columnType(values: string[]): "text" | "number" | "boolean" {
  const filled = values.filter(Boolean);
  if (!filled.length) return "text";
  if (filled.every((value) => /^(yes|no|true|false)$/i.test(value))) return "boolean";
  return filled.every((value) => value !== "" && Number.isFinite(Number(value.replace(/,/g, "")))) ? "number" : "text";
}

/** What the server needs to make a draft, or what's stopping it. */
export function draftBody(draft: Draft) {
  const [headings, ...body] = draft as [string[], ...string[][]];
  const rows = body.filter((row) => row.some(Boolean));
  const unnamed = rows.findIndex((row) => !row[0]);
  if (unnamed >= 0) return { error: `Row ${body.indexOf(rows[unnamed]!) + 1} needs a name.` };
  if (!rows.length) return { error: "Add at least one row." };
  const names = rows.map((row) => row[0]!);
  if (new Set(names).size !== names.length) return { error: "Each row needs its own name." };

  const used = headings.flatMap((_, index) => (index > 0 && (headings[index] || rows.some((row) => row[index])) ? [index] : []));
  const untitled = used.find((index) => !headings[index]);
  if (untitled !== undefined) return { error: `Column ${untitled + 1} needs a heading.` };
  if (!used.length) return { error: "Add at least one column." };

  const columns = used.map((index) => {
    const type = columnType(rows.map((row) => row[index]!));
    // "Weight (g)" names a column and its unit.
    const [, label, unit] = headings[index]!.match(/^(.+?)\s*\(([^()]{1,30})\)$/) ?? [];
    return { label: (type === "number" && label) || headings[index]!, type, ...(type === "number" && unit && { unit }) };
  });
  return { columns, rows: names, values: rows.map((row) => used.map((index) => row[index]!)) };
}
