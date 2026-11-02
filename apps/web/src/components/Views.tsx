import type { Column } from "@skeleton/tables/format";
import { AlertCircle, CalendarClock, Kanban, MoveRight, Table2 } from "lucide-react";
import { useState, type DragEvent } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { NativeSelect } from "@/components/ui/native-select";
import { display, rowPath } from "@/lib/cells";
import type { PublishedTable } from "@/lib/status";
import { boardLanes, localToday, relativeDay, shortDay, upcomingGroups, type ViewMode } from "@/lib/views";

type Row = PublishedTable["rows"][number];

const viewLabels: Record<ViewMode, { label: string; icon: typeof Table2 }> = {
  sheet: { label: "Sheet", icon: Table2 },
  board: { label: "Board", icon: Kanban },
  upcoming: { label: "Upcoming", icon: CalendarClock },
};

/** Switches between the sheet and the views a table can show. */
export function ViewSwitcher({ views, mode, onMode }: { views: ViewMode[]; mode: ViewMode; onMode: (mode: ViewMode) => void }) {
  if (views.length < 2) return null;
  return (
    <div className="inline-flex shrink-0 rounded-md border p-0.5" role="group" aria-label="View">
      {views.map((view) => {
        const { label, icon: Icon } = viewLabels[view];
        return (
          <Button key={view} variant="ghost" size="xs" aria-pressed={mode === view} onClick={() => onMode(view)} className={mode === view ? "bg-selected text-foreground hover:bg-selected" : "text-muted-foreground"}>
            <Icon />
            {label}
          </Button>
        );
      })}
    </div>
  );
}

/** Which column a view is laid out by, when there's more than one to choose from. */
export function ByColumn({ columns, value, onChange, label }: { columns: Column[]; value: string; onChange: (id: string) => void; label: string }) {
  if (columns.length < 2) return null;
  return (
    <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
      {label}
      <NativeSelect value={value} onChange={(event) => onChange(event.target.value)} className="h-7 text-xs text-foreground">
        {columns.map((column) => <option key={column.id} value={column.id}>{column.label}</option>)}
      </NativeSelect>
    </label>
  );
}

/** A row's other values, small, for a card or a list line. */
function Facts({ table, row, skip }: { table: PublishedTable; row: Row; skip: string[] }) {
  const today = localToday();
  const facts = table.columns
    .filter((column) => !skip.includes(column.id))
    .flatMap((column) => {
      const cell = row.cells[column.id];
      if (!cell || "missing" in cell) return [];
      const text = column.type === "date" ? shortDay(cell.value as string, today) : `${display(cell.value)}${column.unit ? ` ${column.unit}` : ""}`;
      return [{ column, text }];
    })
    .slice(0, 4);
  if (!facts.length) return null;
  return (
    <dl className="mt-1.5 space-y-0.5 text-xs">
      {facts.map(({ column, text }) => (
        <div key={column.id} className="flex min-w-0 gap-1.5">
          <dt className="shrink-0 text-muted-foreground">{column.label}</dt>
          <dd className="min-w-0 truncate" title={text}>{text}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Rows as cards in a lane for each value of a column, like a status. Dragging a card to another lane
 * changes its value, and so does the Move menu on each card, for anyone not using a mouse.
 */
export function BoardView({ table, rows, column, onMove }: { table: PublishedTable; rows: Row[]; column: Column; onMove?: (rowKey: string, value: string) => void }) {
  const lanes = boardLanes(table, rows, column);
  const [over, setOver] = useState<string | null>(null);
  const drop = (event: DragEvent, value: string) => {
    event.preventDefault();
    setOver(null);
    const key = event.dataTransfer.getData("text/x-row");
    if (key && onMove) onMove(key, value);
  };
  return (
    <div className="min-h-0 flex-1 overflow-auto bg-muted/40 p-3" role="region" aria-label={`${table.title} by ${column.label}`}>
      <div className="flex min-h-full items-start gap-3">
        {lanes.map((lane) => (
          <section
            key={lane.value || "__none"}
            aria-label={`${lane.label}, ${lane.rows.length}`}
            onDragOver={onMove && ((event) => { event.preventDefault(); setOver(lane.value); })}
            onDragLeave={() => setOver((current) => (current === lane.value ? null : current))}
            onDrop={onMove && ((event) => drop(event, lane.value))}
            className={`flex w-64 shrink-0 flex-col rounded-xl border bg-background transition-colors ${over === lane.value ? "border-brand ring-2 ring-brand/30" : ""}`}
          >
            <h2 className="flex items-center justify-between gap-2 border-b px-3 py-2 text-sm font-medium">
              <span className="truncate">{lane.label}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{lane.rows.length}</span>
            </h2>
            <ul className="space-y-2 p-2">
              {lane.rows.map((row) => (
                <li
                  key={row.key}
                  draggable={!!onMove}
                  onDragStart={(event) => { event.dataTransfer.setData("text/x-row", row.key); event.dataTransfer.effectAllowed = "move"; }}
                  className={`rounded-lg border bg-card p-2.5 shadow-xs ${onMove ? "cursor-grab active:cursor-grabbing" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link href={rowPath(table, row.key)} className="min-w-0 font-medium break-words hover:underline">{row.key}</Link>
                    {onMove && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-xs" aria-label={`Move ${row.key}`} className="-mt-0.5 shrink-0 text-muted-foreground"><MoveRight /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Move to</DropdownMenuLabel>
                          {lanes.filter((target) => target.value !== lane.value).map((target) => <DropdownMenuItem key={target.value || "__none"} onSelect={() => onMove(row.key, target.value)}>{target.label}</DropdownMenuItem>)}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                  <Facts table={table} row={row} skip={[column.id]} />
                </li>
              ))}
              {!lane.rows.length && <li className="rounded-lg border border-dashed px-2.5 py-4 text-center text-xs text-muted-foreground">{onMove ? "Drop a card here" : "Nothing here"}</li>}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

/** Rows by a date: what's overdue, today, this week and later, soonest first. */
export function UpcomingView({ table, rows, column }: { table: PublishedTable; rows: Row[]; column: Column }) {
  const today = localToday();
  const groups = upcomingGroups(rows, column, today);
  return (
    <div className="min-h-0 flex-1 overflow-auto p-3 sm:px-6" role="region" aria-label={`${table.title} by ${column.label}`}>
      <div className="mx-auto max-w-3xl space-y-6 py-2">
        {!groups.length && <p className="py-10 text-center text-sm text-muted-foreground">No rows yet.</p>}
        {groups.map((group) => (
          <section key={group.id} aria-label={`${group.label}, ${group.rows.length}`}>
            <h2 className={`mb-2 flex items-center gap-1.5 text-sm font-medium ${group.id === "overdue" ? "text-destructive" : ""}`}>
              {group.id === "overdue" && <AlertCircle className="size-4" />}
              {group.label}
              <span className="text-xs font-normal text-muted-foreground tabular-nums">{group.rows.length}</span>
            </h2>
            <ul className="divide-y overflow-hidden rounded-xl border">
              {group.rows.map((row) => {
                const cell = row.cells[column.id];
                const day = cell && !("missing" in cell) ? (cell.value as string) : undefined;
                return (
                  <li key={row.key} className="grid gap-x-4 gap-y-1 px-3 py-2.5 sm:grid-cols-[7rem_minmax(0,1fr)]">
                    <div className="text-sm tabular-nums">
                      {day ? (
                        <>
                          <p className={`font-medium ${group.id === "overdue" ? "text-destructive" : ""}`}>{shortDay(day, today)}</p>
                          <p className="text-xs text-muted-foreground">{relativeDay(day, today)}</p>
                        </>
                      ) : <p className="text-muted-foreground">—</p>}
                    </div>
                    <div className="min-w-0">
                      <Link href={rowPath(table, row.key)} className="font-medium hover:underline">{row.key}</Link>
                      <Facts table={table} row={row} skip={[column.id]} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
