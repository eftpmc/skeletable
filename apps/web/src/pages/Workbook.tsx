import type { Cell, Column, FoundCell, Table } from "@skeleton/tables/format";
import { Bot, Check, Copy, ExternalLink, Moon, Search, Sun } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link, Redirect, useLocation, useSearch } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { useJson, type TableSummary } from "@/lib/api";
import { cellId, day, display, host, place, splitQuote } from "@/lib/cells";
import { useTheme } from "@/lib/theme";
import { Message } from "@/pages/Message";

const kindLabels: Record<FoundCell["kind"], string> = {
  "first-hand": "First-hand",
  archived: "Archived copy",
  "second-hand": "Second-hand",
};

const isFound = (cell: Cell): cell is FoundCell => !("missing" in cell);

/** Empty rows carry the grid down the page, as in a spreadsheet. */
const emptyRowsTo = 30;

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

/** Above the grid, like a spreadsheet's: the selected cell's value and evidence, or the table's own description. */
function FormulaBar({ table, selected }: { table: Table; selected?: { rowKey: string; column: Column; cell: Cell } }) {
  const found = table.rows.flatMap((row) => Object.values(row.cells)).filter(isFound);
  const total = table.rows.length * table.columns.length;
  const lastRead = found.reduce((latest, cell) => (cell.read > latest ? cell.read : latest), "");
  const cell = selected?.cell;
  const value = !selected || !cell
    ? table.question
    : isFound(cell)
      ? `${display(cell.value)}${selected.column.unit ? ` ${selected.column.unit}` : ""}`
      : "Not stated";
  return (
    <section className="shrink-0 border-b" aria-live="polite" aria-label="Selected cell">
      <div className="flex min-h-9 items-center border-b text-sm">
        <div className="w-36 shrink-0 truncate border-r px-3 py-1.5 text-xs text-muted-foreground sm:w-64">
          {selected ? `${selected.rowKey} · ${selected.column.label}` : table.title}
        </div>
        <span className="px-3 font-serif text-muted-foreground italic" aria-hidden="true">fx</span>
        <p className="min-w-0 flex-1 truncate py-1.5 pr-3 font-medium">{value}</p>
      </div>
      <div className="h-24 space-y-1.5 overflow-y-auto px-3 py-2 text-sm">
        {!cell ? (
          <>
            <p className="text-muted-foreground">{table.scope}</p>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="secondary">{found.length} of {total} cells</Badge>
              {lastRead && <Badge variant="outline">Read {day(lastRead)}</Badge>}
            </div>
          </>
        ) : isFound(cell) ? (
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
    </section>
  );
}

function Grid({ table, selectedId, select }: { table: Table; selectedId: string | null; select: (id: string | null) => void }) {
  const grid = useRef<HTMLTableElement>(null);

  useEffect(() => {
    if (selectedId) grid.current?.querySelector<HTMLElement>(`[data-cell="${selectedId}"]`)?.focus();
  }, [selectedId]);

  const onKeyDown = (event: KeyboardEvent, rowIndex: number, columnIndex: number) => {
    const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (event.key === "Escape") return select(null);
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    const row = table.rows[Math.min(Math.max(rowIndex + move[0], 0), table.rows.length - 1)]!;
    const column = table.columns[Math.min(Math.max(columnIndex + move[1], 0), table.columns.length - 1)]!;
    select(cellId(row.key, column.id));
  };

  const edge = "border-r border-b";
  const frozen = "sticky z-10 bg-muted";
  return (
    <div className="min-h-0 flex-1 scroll-pt-7 scroll-pl-38 overflow-auto sm:scroll-pl-62" role="region" aria-label={table.title}>
      <table ref={grid} role="grid" className="min-w-full border-separate border-spacing-0 text-sm tabular-nums">
        <thead>
          <tr>
            <th className={`${edge} ${frozen} top-0 left-0 z-30 w-10 min-w-10`}><span className="sr-only">Row</span></th>
            <th scope="col" className={`${edge} ${frozen} top-0 left-10 z-30 w-28 min-w-28 px-2 py-1 text-left text-xs font-medium text-muted-foreground sm:min-w-52`}>Name</th>
            {table.columns.map((column) => (
              <th
                key={column.id}
                scope="col"
                title={column.rule}
                className={`${edge} ${frozen} top-0 z-20 px-2 py-1 text-xs font-medium whitespace-nowrap text-muted-foreground ${column.type === "number" ? "text-right" : "text-left"}`}
              >
                {column.label}{column.unit ? ` (${column.unit})` : ""}
              </th>
            ))}
            <th className={`${frozen} top-0 w-full border-b`} aria-hidden="true" />
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr key={row.key}>
              <td className={`${edge} ${frozen} left-0 text-center text-xs text-muted-foreground`}>{rowIndex + 1}</td>
              <th scope="row" className={`${edge} sticky left-10 z-10 max-w-28 bg-background px-2 py-1 text-left font-medium sm:max-w-none sm:whitespace-nowrap`}>{row.key}</th>
              {table.columns.map((column, columnIndex) => {
                const cell = row.cells[column.id]!;
                const id = cellId(row.key, column.id);
                const isNumber = column.type === "number";
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
                    className={`${edge} max-w-44 cursor-cell truncate sm:max-w-72 px-2 py-1 hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset aria-selected:bg-blue-500/10 aria-selected:ring-2 aria-selected:ring-blue-500 aria-selected:ring-inset ${isNumber ? "text-right" : ""} ${isFound(cell) ? "" : "text-xs text-muted-foreground"}`}
                  >
                    {isFound(cell) ? display(cell.value) : "Not stated"}
                  </td>
                );
              })}
              <td className="border-b" aria-hidden="true" />
            </tr>
          ))}
          {Array.from({ length: Math.max(emptyRowsTo - table.rows.length, 0) }, (_, index) => (
            <tr key={index} aria-hidden="true">
              <td className={`${edge} ${frozen} left-0 text-center text-xs text-muted-foreground`}>{table.rows.length + index + 1}</td>
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

function Sheet({ slug }: { slug: string }) {
  const { data, status, retry } = useJson<Table>(`/api/tables/${encodeURIComponent(slug)}`);
  const [path, navigate] = useLocation();
  const selectedId = new URLSearchParams(useSearch()).get("cell");
  if (status === "missing") return <div className="flex-1"><Message title="There's no table here" /></div>;
  if (status === "failed") {
    return <div className="flex-1"><Message title="This table didn't load" action={<Button variant="outline" size="sm" onClick={retry}>Try again</Button>} /></div>;
  }
  if (!data) {
    return (
      <div className="flex-1 space-y-2 p-3" aria-label="Loading table">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  const row = data.rows.find((r) => selectedId?.startsWith(`${cellId(r.key, "")}`));
  const column = data.columns.find((c) => row && cellId(row.key, c.id) === selectedId);
  return (
    <>
      <FormulaBar table={data} selected={row && column ? { rowKey: row.key, column, cell: row.cells[column.id]! } : undefined} />
      <Grid table={data} selectedId={selectedId} select={(id) => navigate(id ? `${path}?cell=${id}` : path, { replace: true })} />
    </>
  );
}

function AgentButton() {
  const command = `claude mcp add --transport http skeleton ${location.origin}/mcp`;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      // The browser refused; the command is still on screen to select.
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Use from an agent"><Bot /></Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 max-w-[calc(100vw-2rem)] gap-2 p-3">
        <p className="font-medium">Use these from an agent</p>
        <p className="text-muted-foreground">A read-only MCP server. No account needed.</p>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 rounded-md bg-muted px-2 py-1.5 font-mono text-xs break-all">{command}</code>
          <Button variant="outline" size="icon-sm" onClick={copy} aria-label={copied ? "Copied" : "Copy command"}>
            {copied ? <Check /> : <Copy />}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** The whole site: one workbook, with a sheet for each table. */
export function Workbook({ slug }: { slug?: string }) {
  const { dark, toggle } = useTheme();
  const [query, setQuery] = useState("");
  const { data, status, retry } = useJson<TableSummary[]>(`/api/tables?q=${encodeURIComponent(query)}`);
  if (!slug && data?.[0]) return <Redirect to={`/tables/${data[0].slug}`} replace />;
  return (
    <div className="flex h-svh flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b px-3 py-1.5">
        <Link href="/" className="text-sm font-semibold tracking-tight">skeleton</Link>
        <div className="relative ml-auto w-full max-w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-7 pl-7 text-sm"
            type="search"
            aria-label="Search the tables"
            placeholder="Search tables and rows"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <AgentButton />
        <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label={dark ? "Use light theme" : "Use dark theme"}>
          {dark ? <Sun /> : <Moon />}
        </Button>
      </header>
      {slug ? <Sheet key={slug} slug={slug} /> : <div className="flex-1" />}
      <nav className="flex shrink-0 items-stretch overflow-x-auto border-t bg-muted text-sm" aria-label="Tables">
        {status === "failed" ? (
          <Button variant="ghost" size="sm" onClick={retry}>The tables didn't load. Try again</Button>
        ) : data?.length === 0 ? (
          <span className="px-3 py-1.5 text-muted-foreground">No table covers "{query}"</span>
        ) : (
          data?.map((table) => (
            <Link
              key={table.slug}
              href={`/tables/${table.slug}`}
              aria-current={table.slug === slug ? "page" : undefined}
              className="-mt-px border-t-2 border-r border-t-transparent px-3 py-1.5 whitespace-nowrap text-muted-foreground hover:text-foreground aria-[current=page]:border-t-blue-500 aria-[current=page]:bg-background aria-[current=page]:font-medium aria-[current=page]:text-foreground"
            >
              {table.title.split(":")[0]}
            </Link>
          ))
        )}
      </nav>
    </div>
  );
}
