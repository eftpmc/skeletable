import type { Cell, Column, FoundCell, Table } from "@skeleton/tables/format";
import { ExternalLink, Info } from "lucide-react";
import { useEffect, useRef, type KeyboardEvent } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { AccountButton, AgentButton, Logo, ThemeButton } from "@/components/Chrome";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { useJson } from "@/lib/api";
import { accountName, cellId, day, display, host, place, splitQuote } from "@/lib/cells";
import { Message } from "@/pages/Message";

const kindLabels: Record<FoundCell["kind"], string> = {
  "first-hand": "First-hand",
  archived: "Archived copy",
  "second-hand": "Second-hand",
};

const isFound = (cell: Cell): cell is FoundCell => !("missing" in cell);

/** Empty rows carry the grid down the page, as in a spreadsheet. */
const fullHeightRows = 30;

const SourceLink = ({ url, label }: { url: string; label: string }) => (
  <Button variant="outline" size="xs" className="max-w-full" asChild>
    <a href={url} target="_blank" rel="noopener noreferrer">
      <span className="truncate">{label}</span>
      <ExternalLink />
    </a>
  </Button>
);

function Quote({ cell }: { cell: FoundCell }) {
  const [before, match, after] = splitQuote(cell.value, cell.quote);
  return (
    <p className="break-words text-muted-foreground">
      {before}
      {match && <mark className="rounded-sm bg-blue-500/20 px-0.5 font-medium text-foreground">{match}</mark>}
      {after}
    </p>
  );
}

export type Selected = { rowKey: string; column: Column; cell: Cell };

/** Above the grid, like a spreadsheet's: one line until a cell is selected, then its evidence opens beneath. */
export function FormulaBar({ selected }: { selected?: Selected }) {
  const cell = selected?.cell;
  const value = !selected || !cell ? undefined : isFound(cell) ? `${display(cell.value)}${selected.column.unit ? ` ${selected.column.unit}` : ""}` : "Not stated";
  return (
    <section className="shrink-0 border-y" aria-live="polite" aria-label="Selected cell">
      <div className="flex h-9 items-center text-sm">
        <div className="w-32 shrink-0 truncate border-r px-3 text-xs leading-9 text-muted-foreground sm:w-56">
          {selected ? `${selected.rowKey} · ${selected.column.label}` : ""}
        </div>
        <span className="px-3 font-serif text-muted-foreground italic" aria-hidden="true">fx</span>
        <p className={`min-w-0 flex-1 truncate pr-3 ${value ? "font-medium" : "text-muted-foreground"}`}>{value ?? "Select a cell to see its source"}</p>
      </div>
      {cell && (
        <div key={selected.rowKey + selected.column.id} className="max-h-36 space-y-1.5 overflow-y-auto border-t px-3 py-2 text-sm duration-150 animate-in fade-in slide-in-from-top-1">
          {isFound(cell) ? (
            <>
              <Quote cell={cell} />
              <div className="flex flex-wrap items-center gap-1.5">
                <SourceLink url={cell.source} label={host(cell.source)} />
                <Badge variant="secondary">{kindLabels[cell.kind]}</Badge>
                <Badge variant="outline">Read {day(cell.read)}</Badge>
              </div>
            </>
          ) : (
            <>
              <p className="text-muted-foreground">No source we could use stated this. We looked here on {day(cell.read)}:</p>
              <div className="flex flex-wrap gap-1.5">
                {cell.checked.map((url) => <SourceLink key={url} url={url} label={place(url)} />)}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

type GridProps = { table: Table; selectedId: string | null; select: (id: string | null) => void; emptyRows?: number; focusOnLoad?: boolean };

export function Grid({ table, selectedId, select, emptyRows = fullHeightRows - table.rows.length, focusOnLoad = true }: GridProps) {
  const grid = useRef<HTMLTableElement>(null);
  const focused = useRef(focusOnLoad ? null : selectedId);

  useEffect(() => {
    if (selectedId && selectedId !== focused.current) grid.current?.querySelector<HTMLElement>(`[data-cell="${selectedId}"]`)?.focus();
    focused.current = selectedId;
  }, [selectedId]);

  const onKeyDown = (event: KeyboardEvent, rowIndex: number, columnIndex: number) => {
    if (event.key === "Escape") return select(null);
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    const row = table.rows[Math.min(Math.max(rowIndex + move[0], 0), table.rows.length - 1)]!;
    const column = table.columns[Math.min(Math.max(columnIndex + move[1], 0), table.columns.length - 1)]!;
    select(cellId(row.key, column.id));
  };

  const activeRow = table.rows.findIndex((row) => table.columns.some((column) => cellId(row.key, column.id) === selectedId));
  const activeColumn = table.columns.findIndex((column) => table.rows.some((row) => cellId(row.key, column.id) === selectedId));
  const header = (active: boolean) => (active ? "bg-blue-100 text-foreground dark:bg-blue-950" : "bg-muted");
  const edge = "border-r border-b";
  const frozen = "sticky z-10";
  return (
    <div className="min-h-0 flex-1 scroll-pt-7 scroll-pl-38 overflow-auto sm:scroll-pl-62" role="region" aria-label={table.title}>
      <table ref={grid} role="grid" className="min-w-full border-separate border-spacing-0 text-sm tabular-nums">
        <thead>
          <tr>
            <th className={`${edge} ${frozen} top-0 left-0 z-30 w-10 min-w-10 bg-muted`}><span className="sr-only">Row</span></th>
            <th scope="col" className={`${edge} ${frozen} top-0 left-10 z-30 w-28 min-w-28 bg-muted px-2 py-1 text-left text-xs font-medium text-muted-foreground sm:min-w-52`}>Name</th>
            {table.columns.map((column, columnIndex) => (
              <th
                key={column.id}
                scope="col"
                title={column.rule}
                className={`${edge} ${frozen} top-0 z-20 px-2 py-1 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors ${column.type === "number" ? "text-right" : "text-left"} ${header(columnIndex === activeColumn)}`}
              >
                {column.label}{column.unit ? ` (${column.unit})` : ""}
              </th>
            ))}
            <th className={`${frozen} top-0 w-full border-b bg-muted`} aria-hidden="true" />
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr key={row.key}>
              <td className={`${edge} ${frozen} left-0 text-center text-xs text-muted-foreground transition-colors ${header(rowIndex === activeRow)}`}>{rowIndex + 1}</td>
              <th scope="row" className={`${edge} sticky left-10 z-10 max-w-28 bg-background px-2 py-1 text-left font-medium sm:max-w-none sm:whitespace-nowrap`}>{row.key}</th>
              {table.columns.map((column, columnIndex) => {
                const cell = row.cells[column.id]!;
                const id = cellId(row.key, column.id);
                const first = rowIndex === 0 && columnIndex === 0;
                return (
                  <td
                    key={column.id}
                    role="gridcell"
                    data-cell={id}
                    tabIndex={selectedId === id || (!selectedId && first) ? 0 : -1}
                    aria-selected={selectedId === id}
                    onClick={() => select(id)}
                    onKeyDown={(event) => onKeyDown(event, rowIndex, columnIndex)}
                    className={`${edge} max-w-44 cursor-cell truncate px-2 py-1 hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset aria-selected:bg-blue-500/10 aria-selected:ring-2 aria-selected:ring-blue-500 aria-selected:ring-inset sm:max-w-72 ${column.type === "number" ? "text-right" : ""} ${isFound(cell) ? "" : "text-xs text-muted-foreground"}`}
                  >
                    {isFound(cell) ? display(cell.value) : "Not stated"}
                  </td>
                );
              })}
              <td className="border-b" aria-hidden="true" />
            </tr>
          ))}
          {Array.from({ length: Math.max(emptyRows, 0) }, (_, index) => (
            <tr key={index} aria-hidden="true">
              <td className={`${edge} ${frozen} left-0 bg-muted text-center text-xs text-muted-foreground`}>{table.rows.length + index + 1}</td>
              <td className={`${edge} sticky left-10 z-10 bg-background px-2 py-1`}>&nbsp;</td>
              {table.columns.map((column) => <td key={column.id} className={edge} />)}
              <td className="border-b" />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TopBar({ table, owner }: { table?: Table; owner: string }) {
  const cells = table?.rows.flatMap((row) => Object.values(row.cells)) ?? [];
  const found = cells.filter(isFound);
  const lastRead = found.reduce((latest, cell) => (cell.read > latest ? cell.read : latest), "");
  return (
    <header className="flex shrink-0 items-center gap-3 px-3 py-2">
      <Link href="/" aria-label="All tables" className="shrink-0 rounded-lg transition-transform hover:scale-105 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
        <Logo className="size-9" />
      </Link>
      <div className="min-w-0 flex-1">
        {table ? (
          <>
            <h1 className="truncate text-lg leading-6">{table.title}</h1>
            <p className="truncate text-xs text-muted-foreground">
              by <Link href={`/${owner}`} className="hover:text-foreground hover:underline">{accountName(owner)}</Link> · {found.length} of {cells.length} cells · Read {day(lastRead)}
            </p>
          </>
        ) : (
          <p className="text-lg leading-6">Skeletable</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {table && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="About this table"><Info /></Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-96 max-w-[calc(100vw-2rem)] gap-2 p-3">
              <p className="font-medium">{table.question}</p>
              <p className="text-muted-foreground">{table.scope}</p>
            </PopoverContent>
          </Popover>
        )}
        <AgentButton />
        <ThemeButton />
        <AccountButton />
      </div>
    </header>
  );
}

export function Sheet({ owner, slug }: { owner: string; slug: string }) {
  const { data, status, retry } = useJson<Table>(`/api/tables/${owner}/${slug}`);
  const [path, navigate] = useLocation();
  const selectedId = new URLSearchParams(useSearch()).get("cell");

  useEffect(() => {
    if (data) document.title = `${data.title} · Skeletable`;
  }, [data]);

  const row = data?.rows.find((r) => selectedId?.startsWith(cellId(r.key, "")));
  const column = data?.columns.find((c) => row && cellId(row.key, c.id) === selectedId);
  return (
    <div className="flex h-svh flex-col">
      <TopBar table={data} owner={owner} />
      {status === "missing" ? (
        <Message title="There's no table here" />
      ) : status === "failed" ? (
        <Message title="This table didn't load" action={<Button variant="outline" size="sm" onClick={retry}>Try again</Button>} />
      ) : data ? (
        <>
          <FormulaBar selected={row && column ? { rowKey: row.key, column, cell: row.cells[column.id]! } : undefined} />
          <Grid table={data} selectedId={selectedId} select={(id) => navigate(id ? `${path}?cell=${id}` : path, { replace: true })} />
        </>
      ) : (
        <div className="flex-1 space-y-2 p-3" aria-label="Loading table">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}
    </div>
  );
}
