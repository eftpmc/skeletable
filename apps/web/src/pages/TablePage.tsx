import type { Cell, Column, FoundCell, Table as TableData } from "@skeleton/tables/format";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useJson } from "@/lib/api";
import { cellId, day, display, host, place, splitQuote } from "@/lib/cells";
import { Message } from "@/pages/Message";

const kindLabels: Record<FoundCell["kind"], string> = {
  "first-hand": "First-hand",
  archived: "Archived copy",
  "second-hand": "Second-hand",
};

const isFound = (cell: Cell): cell is FoundCell => !("missing" in cell);

const SourceLink = ({ url, label }: { url: string; label: string }) => (
  <Button variant="outline" size="sm" className="max-w-full" asChild>
    <a href={url} target="_blank" rel="noopener noreferrer">
      <span className="truncate">{label}</span>
      <ExternalLink />
    </a>
  </Button>
);

function Quote({ cell }: { cell: FoundCell }) {
  const [before, match, after] = splitQuote(cell.value, cell.quote);
  return (
    <blockquote className="border-l-2 pl-3 break-words text-muted-foreground">
      {before}
      {match && <mark className="rounded-sm bg-primary/10 px-0.5 font-medium text-foreground">{match}</mark>}
      {after}
    </blockquote>
  );
}

function Evidence({ cell, column, rowKey }: { cell: Cell; column: Column; rowKey: string }) {
  return (
    <>
      <div>
        <p className="text-xs text-muted-foreground">
          {rowKey} · {column.label}
        </p>
        <p className="mt-0.5 font-medium">
          {isFound(cell) ? `${display(cell.value)}${column.unit ? ` ${column.unit}` : ""}` : "Not stated"}
        </p>
      </div>
      {isFound(cell) ? (
        <>
          <Quote cell={cell} />
          <div className="flex flex-wrap items-center gap-2">
            <SourceLink url={cell.source} label={host(cell.source)} />
            <Badge variant="secondary">{kindLabels[cell.kind]}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">Read {day(cell.read)}</p>
        </>
      ) : (
        <>
          <p className="text-muted-foreground">No source we could use stated this. We looked here on {day(cell.read)}:</p>
          <div className="flex flex-col items-start gap-2">
            {cell.checked.map((url) => <SourceLink key={url} url={url} label={place(url)} />)}
          </div>
        </>
      )}
    </>
  );
}

type ValueCellProps = { cell: Cell; column: Column; rowKey: string; open: boolean; onOpenChange: (open: boolean) => void };

function ValueCell({ cell, column, rowKey, open, onOpenChange }: ValueCellProps) {
  const isNumber = column.type === "number";
  const trigger = useRef<HTMLButtonElement>(null);
  // A shared link can open a cell that's scrolled out of view.
  useEffect(() => {
    if (open) trigger.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [open]);
  return (
    <TableCell className={isNumber ? "text-right tabular-nums" : "min-w-40 whitespace-normal"}>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button
            ref={trigger}
            variant="ghost"
            size="sm"
            className={`h-auto min-h-7 font-normal whitespace-normal ${isNumber ? "-mr-2.5" : "-ml-2.5 text-left"} ${isFound(cell) ? "" : "text-muted-foreground"}`}
          >
            {isFound(cell) ? display(cell.value) : "Not stated"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 max-w-[calc(100vw-2rem)] gap-3 p-4" align={isNumber ? "end" : "start"} collisionPadding={16}>
          <Evidence cell={cell} column={column} rowKey={rowKey} />
        </PopoverContent>
      </Popover>
    </TableCell>
  );
}

function TableView({ table }: { table: TableData }) {
  const [path, navigate] = useLocation();
  const openCell = new URLSearchParams(useSearch()).get("cell");
  const found = table.rows.flatMap((row) => Object.values(row.cells)).filter(isFound);
  const total = table.rows.length * table.columns.length;
  const lastRead = found.reduce((latest, cell) => (cell.read > latest ? cell.read : latest), "");
  return (
    <>
      <section className="py-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{table.title}</h1>
        <p className="mt-1 text-muted-foreground">{table.question}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant="secondary">{found.length} of {total} cells</Badge>
          {lastRead && <Badge variant="outline">Read {day(lastRead)}</Badge>}
        </div>
      </section>
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4"><span className="sr-only">Name</span></TableHead>
              {table.columns.map((column) => (
                <TableHead key={column.id} className={column.type === "number" ? "text-right" : ""}>
                  {column.label}
                  {column.unit && <span className="font-normal text-muted-foreground"> ({column.unit})</span>}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {table.rows.map((row) => (
              <TableRow key={row.key}>
                <TableCell className="pl-4 font-medium">{row.key}</TableCell>
                {table.columns.map((column) => {
                  const id = cellId(row.key, column.id);
                  return (
                    <ValueCell
                      key={column.id}
                      cell={row.cells[column.id]!}
                      column={column}
                      rowKey={row.key}
                      open={openCell === id}
                      onOpenChange={(open) => navigate(open ? `${path}?cell=${id}` : path, { replace: true })}
                    />
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <p className="mt-4 max-w-2xl text-sm text-muted-foreground">{table.scope}</p>
    </>
  );
}

export function TablePage({ slug }: { slug: string }) {
  const { data, status, retry } = useJson<TableData>(`/api/tables/${encodeURIComponent(slug)}`);
  return (
    <>
      <Button variant="ghost" size="sm" className="-ml-2.5" asChild>
        <Link href="/">
          <ArrowLeft />
          All tables
        </Link>
      </Button>
      {status === "missing" ? (
        <Message title="There's no table here" />
      ) : status === "failed" ? (
        <Message title="This table didn't load" action={<Button variant="outline" size="sm" onClick={retry}>Try again</Button>} />
      ) : data ? (
        <TableView table={data} />
      ) : (
        <div className="space-y-3 py-6" aria-label="Loading table">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-5 w-full max-w-md" />
          <Skeleton className="mt-6 h-72 rounded-xl" />
        </div>
      )}
    </>
  );
}
