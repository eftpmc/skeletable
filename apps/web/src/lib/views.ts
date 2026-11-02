import type { Column } from "@skeleton/tables/format";
import type { PublishedTable } from "@/lib/status";

/** Other ways to look at a table than the sheet: a board grouped by status, or what's coming up by date. */
export type ViewMode = "sheet" | "board" | "upcoming";

type Row = PublishedTable["rows"][number];

const valueOf = (row: Row, columnId: string) => {
  const cell = row.cells[columnId];
  return cell && !("missing" in cell) ? cell.value : undefined;
};

/** Columns a board can group by: text columns with a fixed list of values, like a status. */
export const boardColumns = (table: Pick<PublishedTable, "columns">) => table.columns.filter((column) => column.type === "text" && column.choices?.length);

/** Columns the upcoming view can sort by. */
export const dateColumns = (table: Pick<PublishedTable, "columns">) => table.columns.filter((column) => column.type === "date");

/** The views a table can show: a board needs a column with choices, and upcoming needs a date column. */
export const availableViews = (table: Pick<PublishedTable, "columns">): ViewMode[] => ["sheet", ...(boardColumns(table).length ? ["board" as const] : []), ...(dateColumns(table).length ? ["upcoming" as const] : [])];

/** A date column named for something still to do, like a follow-up or a deadline, whose past dates are overdue. */
export const isDueColumn = (column: Pick<Column, "label">) => /follow|due|deadline|next|remind|until|by\b|renew|expir/i.test(column.label);

/** The date column upcoming starts with: one for something still to do, or else the last one. */
export function defaultDateColumn(table: Pick<PublishedTable, "columns">) {
  const dates = dateColumns(table);
  return dates.find(isDueColumn) ?? dates.at(-1);
}

export type Lane = { value: string; label: string; rows: Row[] };

/**
 * A board's lanes: each of the column's choices in order, then any other values found in it, then
 * rows with no value. Empty lanes of the column's own choices still show, so a card can move there.
 */
export function boardLanes(table: Pick<PublishedTable, "columns">, rows: Row[], column: Column): Lane[] {
  const choices = column.choices ?? [];
  const lanes = new Map<string, Lane>(choices.map((choice) => [choice, { value: choice, label: choice, rows: [] }]));
  const none: Lane = { value: "", label: `No ${column.label.toLowerCase()}`, rows: [] };
  for (const row of rows) {
    const value = valueOf(row, column.id);
    if (value === undefined) {
      none.rows.push(row);
      continue;
    }
    const text = String(value);
    if (!lanes.has(text)) lanes.set(text, { value: text, label: text, rows: [] });
    lanes.get(text)!.rows.push(row);
  }
  return [...lanes.values(), ...(none.rows.length ? [none] : [])];
}

export type Group = { id: "overdue" | "earlier" | "today" | "week" | "later" | "none"; label: string; rows: Row[] };

const addDays = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** Today where the person is, as YYYY-MM-DD. */
export const localToday = () => new Date().toLocaleDateString("en-CA");

/**
 * Rows by a date column: today, the next seven days, later, and past dates, which are overdue for a
 * column about something still to do. Each group runs soonest first, except the past, which runs
 * most recent first. Rows with no date come last. Empty groups are left out.
 */
export function upcomingGroups(rows: Row[], column: Column, today: string): Group[] {
  const dated = rows.map((row) => ({ row, day: valueOf(row, column.id) as string | undefined }));
  const weekEnd = addDays(today, 7);
  const pick = (test: (day: string) => boolean, newestFirst = false) =>
    dated.filter(({ day }) => day !== undefined && test(day)).sort((a, b) => (newestFirst ? b.day!.localeCompare(a.day!) : a.day!.localeCompare(b.day!))).map(({ row }) => row);
  const due = isDueColumn(column);
  const groups: Group[] = [
    ...(due ? [{ id: "overdue" as const, label: "Overdue", rows: pick((day) => day < today) }] : []),
    { id: "today", label: "Today", rows: pick((day) => day === today) },
    { id: "week", label: "Next 7 days", rows: pick((day) => day > today && day <= weekEnd) },
    { id: "later", label: "Later", rows: pick((day) => day > weekEnd) },
    ...(due ? [] : [{ id: "earlier" as const, label: "Earlier", rows: pick((day) => day < today, true) }]),
    { id: "none", label: `No ${column.label.toLowerCase()}`, rows: dated.filter(({ day }) => day === undefined).map(({ row }) => row) },
  ];
  return groups.filter((group) => group.rows.length);
}

/** A day as a person reads it: "Oct 28", with the year only when it isn't this one. */
export function shortDay(day: string, today = localToday()) {
  const date = new Date(`${day}T00:00:00Z`);
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC" });
}

/** How far a day is from today, in words: "today", "in 3 days", "2 days ago". */
export function relativeDay(day: string, today = localToday()) {
  const days = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}
