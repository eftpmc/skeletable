const MAX_COLUMNS = 20;

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

/** The kind of column a list of values makes. Anything mixed stays text. */
export function columnType(values: string[]): "text" | "number" | "boolean" {
  const filled = values.filter(Boolean);
  if (!filled.length) return "text";
  if (filled.every((value) => /^(yes|no|true|false)$/i.test(value))) return "boolean";
  return filled.every((value) => Number.isFinite(Number(value.replace(/,/g, "")))) ? "number" : "text";
}

/** A column from its heading. "Weight (g)" names a number and its unit, and otherwise its values decide. */
export function headingColumn(heading: string, values: string[] = []) {
  const [, label, unit] = heading.match(/^(.+?)\s*\(([^()]{1,30})\)$/) ?? [];
  const type = columnType(values);
  if (label && (type === "number" || (!values.some(Boolean) && unit))) return { label, type: "number" as const, unit: unit! };
  return { label: heading, type };
}

type Shape = { columns: { id: string }[]; rows: { key: string }[] };

/**
 * What a paste adds to a draft, starting from a cell. `atColumn` of -1 is the Name column. Pasting a
 * whole sheet into one with no columns brings its first row in as the headings.
 */
export function gridChange(table: Shape, atRow: number, atColumn: number, text: string) {
  const lines = parsePaste(text);
  const width = Math.max(...lines.map((line) => line.length));
  const headed = !table.columns.length && atColumn === -1 && width > 1;
  const body = headed ? lines.slice(1) : lines;
  const skip = atColumn === -1 ? 1 : 0;
  const start = Math.max(atColumn, 0);

  const addColumns: ReturnType<typeof headingColumn>[] = [];
  const slots: string[] = [];
  for (let index = skip; index < width && start + index - skip < MAX_COLUMNS; index++) {
    const at = start + index - skip;
    const existing = table.columns[at]?.id;
    if (existing) {
      slots.push(existing);
      continue;
    }
    slots.push(`new:${addColumns.length}`);
    addColumns.push(headingColumn((headed && lines[0]![index]) || `Column ${at + 1}`, body.map((line) => line[index] ?? "")));
  }

  const addRows: string[] = [];
  const cells: { row: string; column: string; value: string }[] = [];
  body.forEach((line, offset) => {
    const held = table.rows[atRow + offset]?.key;
    const row = held ?? (atColumn === -1 ? line[0] : undefined);
    if (!row) return;
    if (!held) addRows.push(row);
    slots.forEach((column, index) => {
      const value = line[index + skip];
      if (value) cells.push({ row, column, value });
    });
  });
  return { addColumns: addColumns.map((column) => ({ ...column, rule: "" })), addRows, cells };
}
