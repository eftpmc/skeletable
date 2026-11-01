import type { Cell, Column, FoundCell } from "@skeleton/tables/format";
import { ArrowDown, ArrowUp, ExternalLink, Info, Lock, Pencil, Plus, ScanLine, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from "react";
import { toast } from "sonner";
import { Link, useLocation, useSearch } from "wouter";
import { Input } from "@/components/ui/input";
import { AccountButton, Logo } from "@/components/Chrome";
import { DownloadButton } from "@/components/Download";
import { FilterButton } from "@/components/Filter";
import { NoTable } from "@/components/NoTable";
import { ShareButton } from "@/components/Share";
import { Shortcuts } from "@/components/Shortcuts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { signInHref } from "@/lib/account";
import { postJson, useJson, useMe } from "@/lib/api";
import { cellId, day, display, host, ownerLabel, place, splitQuote } from "@/lib/cells";
import { copyText } from "@/lib/copy";
import { NAME_COLUMN, filteredRows, matchingRows, nextSort, readView, sortedRows, viewSearch, type SheetFilters, type SheetSort, type SheetView } from "@/lib/sheet";
import { cellStatus, statusCounts, statuses, type CellStatus, type PublishedTable } from "@/lib/status";
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
      {match && <mark className="rounded-sm bg-brand/25 px-0.5 font-medium text-foreground">{match}</mark>}
      {after}
    </p>
  );
}

export type Selected = { rowKey: string; column: Column; cell: Cell; status?: CellStatus };

function SuggestButton({ onSuggest, canEdit }: { onSuggest: () => void; canEdit: boolean }) {
  const { canSignIn, user } = useMe();
  if (!canSignIn) return null;
  if (!user) {
    return (
      <Button variant="ghost" size="xs" asChild>
        <a href={signInHref()}><Pencil />Sign in to suggest</a>
      </Button>
    );
  }
  return <Button variant="ghost" size="xs" onClick={onSuggest}><Pencil />{canEdit ? "Edit value" : "Suggest a change"}</Button>;
}

/** Propose a new value with its proof, which the server tests before anyone reviews it. */
function SuggestForm({ table, selected, canEdit, onDone }: { table: PublishedTable; selected: Selected; canEdit: boolean; onDone: (sent: boolean) => void }) {
  const [form, setForm] = useState({ value: "", source: "", quote: "" });
  const [error, setError] = useState<string>();
  const [sending, setSending] = useState(false);
  const field = (name: keyof typeof form) => ({ value: form[name], onChange: (event: { target: { value: string } }) => setForm({ ...form, [name]: event.target.value }) });
  const send = async (event: FormEvent) => {
    event.preventDefault();
    setSending(true);
    setError(undefined);
    const { ok, data } = await postJson<{ error?: string }>(`/api/tables/${table.owner}/${table.slug}/proposals`, { ...form, row: selected.rowKey, column: selected.column.id });
    setSending(false);
    if (!ok) return setError(data.error ?? "That didn't send. Try again.");
    toast.success(canEdit ? "Value saved" : "Proposal sent");
    onDone(true);
  };
  return (
    <form onSubmit={send} onKeyDown={(event) => event.stopPropagation()} className="space-y-2 border-t px-3 py-2 text-sm duration-150 animate-in fade-in slide-in-from-top-1">
      <p className="text-xs text-muted-foreground">{selected.column.rule}</p>
      <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
        <Input aria-label="New value" placeholder={`New value${selected.column.unit ? ` (${selected.column.unit})` : ""}`} required {...field("value")} />
        <Input aria-label="Source link" type="url" placeholder="Link to the page that states it" required {...field("source")} />
      </div>
      <Input aria-label="Exact quote" placeholder="The exact words on that page" required maxLength={400} {...field("quote")} />
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={sending}>{sending ? "Checking the page..." : canEdit ? "Save value" : "Send proposal"}</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => onDone(false)}>Cancel</Button>
        {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
      </div>
    </form>
  );
}

function StatusBadge({ status }: { status: CellStatus }) {
  const { label, detail, icon: Icon } = statuses[status];
  return (
    <Badge variant="outline" title={detail}>
      <Icon />
      {label}
    </Badge>
  );
}

/** What the X-ray found: how the table's cells stack up, worst news first. */
function XrayReading({ table }: { table: PublishedTable }) {
  const counts = statusCounts(table);
  return (
    <div className="flex min-w-0 items-center gap-3 overflow-x-auto duration-200 animate-in fade-in">
      {(Object.keys(statuses) as CellStatus[]).filter((status) => counts.has(status)).map((status) => {
        const { label, detail, icon: Icon, tint } = statuses[status];
        return (
          <span key={status} title={detail} className="flex shrink-0 items-center gap-1">
            <span className={`grid size-4 place-items-center rounded-sm ${tint}`}><Icon className="size-2.5" /></span>
            <span className="font-medium tabular-nums">{counts.get(status)}</span>
            <span className="text-muted-foreground">{label}</span>
          </span>
        );
      })}
    </div>
  );
}

/** Lets an owner add a row from the status bar. */
function AddRow({ table, onAdded }: { table: PublishedTable; onAdded: () => void }) {
  const { user } = useMe();
  const [key, setKey] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  if (!user?.accounts.includes(table.owner)) return null;
  const add = async (event: FormEvent) => {
    event.preventDefault();
    const { ok, data } = await postJson<{ error?: string }>(`/api/tables/${table.owner}/${table.slug}/rows`, { key });
    if (!ok) return setError(data.error ?? "That didn't save.");
    toast.success("Row added");
    setKey("");
    setError(undefined);
    setOpen(false);
    onAdded();
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="xs" className="shrink-0 text-muted-foreground"><Plus />Add row</Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-2 p-3">
        <form onSubmit={add} className="flex gap-2">
          <Input aria-label="New row name" placeholder="Row name" required maxLength={120} value={key} onChange={(event) => setKey(event.target.value)} />
          <Button type="submit" size="sm">Add</Button>
        </form>
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      </PopoverContent>
    </Popover>
  );
}

/** Along the bottom of the sheet, like a spreadsheet's: the table's tools, out of the way of the data. */
function StatusBar({ table, xray, onXray, onChanged, find, onFind, findInput, filters, onFilters, filtering, onFiltering, shown }: { table: PublishedTable; xray: boolean; onXray: () => void; onChanged: () => void; find: string; onFind: (find: string) => void; findInput: RefObject<HTMLInputElement | null>; filters: SheetFilters; onFilters: (filters: SheetFilters) => void; filtering: boolean; onFiltering: (open: boolean) => void; shown: number }) {
  return (
    <footer className="flex h-9 shrink-0 items-center gap-2 overflow-x-auto border-t bg-muted px-2 text-xs">
      <div className="relative w-24 shrink-0 sm:w-44">
        <Search className="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-muted-foreground" />
        <Input ref={findInput} aria-label="Find in this table" placeholder="Find" value={find} onChange={(event) => onFind(event.target.value)} className="h-6 bg-background pl-6 text-xs md:text-xs" />
      </div>
      <FilterButton table={table} filters={filters} onChange={onFilters} open={filtering} onOpenChange={onFiltering} />
      {shown !== table.rows.length && <span className="shrink-0 text-muted-foreground tabular-nums">{shown} of {table.rows.length}</span>}
      <Button
        variant="ghost"
        size="xs"
        title="Show how each value was checked"
        aria-pressed={xray}
        onClick={onXray}
        className={xray ? "bg-selected text-foreground hover:bg-selected" : "text-muted-foreground"}
      >
        <ScanLine />
        X-ray
      </Button>
      {xray && <XrayReading table={table} />}
      <AddRow table={table} onAdded={onChanged} />
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="xs" className="ml-auto shrink-0 text-muted-foreground">
            <Info />
            About
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-96 max-w-[calc(100vw-2rem)] gap-2 p-3">
          <p className="font-medium">{table.question}</p>
          <p className="text-muted-foreground">{table.scope}</p>
        </PopoverContent>
      </Popover>
    </footer>
  );
}

/** Above the grid, like a spreadsheet's: one line until a cell is selected, then its evidence opens beneath. */
export function FormulaBar({ selected, table, onChanged }: { selected?: Selected; table?: PublishedTable; onChanged?: () => void }) {
  const { user } = useMe();
  const canEdit = !!table && !!user?.accounts.includes(table.owner);
  const [suggesting, setSuggesting] = useState(false);
  const [sent, setSent] = useState(false);
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
      {cell && table && suggesting && (
        <SuggestForm
          key={selected.rowKey + selected.column.id}
          table={table}
          selected={selected}
          canEdit={canEdit}
          onDone={(done) => {
            setSuggesting(false);
            setSent(done && !canEdit);
            if (done) onChanged?.();
          }}
        />
      )}
      {cell && !suggesting && (
        <div key={selected.rowKey + selected.column.id} className="max-h-36 space-y-1.5 overflow-y-auto border-t px-3 py-2 text-sm duration-150 animate-in fade-in slide-in-from-top-1">
          {isFound(cell) ? (
            <>
              <Quote cell={cell} />
              <div className="flex flex-wrap items-center gap-1.5">
                <SourceLink url={cell.source} label={host(cell.source)} />
                <Badge variant="secondary">{kindLabels[cell.kind]}</Badge>
                {selected.status && <StatusBadge status={selected.status} />}
                {table && <SuggestButton onSuggest={() => setSuggesting(true)} canEdit={canEdit} />}
                <Badge variant="outline">Read {day(cell.read)}</Badge>
              </div>
            </>
          ) : (
            <>
              <p className="text-muted-foreground">{cell.checked.length ? `No source we could use stated this. We looked here on ${day(cell.read)}:` : "Nothing has been added here yet."}</p>
              <div className="flex flex-wrap gap-1.5">
                {cell.checked.map((url) => <SourceLink key={url} url={url} label={place(url)} />)}
                {table && <SuggestButton onSuggest={() => setSuggesting(true)} canEdit={canEdit} />}
              </div>
            </>
          )}
          {sent && table && (
            <p role="status" className="text-xs text-muted-foreground">
              Thanks, it's in <Link href={`/${table.owner}/${table.slug}/proposals`} className="underline">Proposals</Link> for the owner to review.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

type GridProps = {
  table: PublishedTable;
  selectedId: string | null;
  select: (id: string | null) => void;
  emptyRows?: number;
  focusOnLoad?: boolean;
  xray?: boolean;
  // Sorting, resizing and copying only happen in the full sheet, so previews leave these out.
  sort?: SheetSort;
  onSort?: (column: string) => void;
  widths?: Record<string, number>;
  onResize?: (column: string, width: number) => void;
  onCopy?: (text: string) => void;
};

const MIN_COLUMN_WIDTH = 64;

/** A column heading that sorts when clicked, and resizes from its right edge. */
function HeaderContent({ column, label, sort, onSort, onResize }: { column: string; label: ReactNode; sort?: SheetSort; onSort?: (column: string) => void; onResize?: (column: string, width: number) => void }) {
  const active = sort?.column === column;
  const SortIcon = sort?.descending ? ArrowDown : ArrowUp;
  const startResize = (event: PointerEvent<HTMLSpanElement>) => {
    event.preventDefault();
    const cell = event.currentTarget.parentElement!;
    const [startX, startWidth] = [event.clientX, cell.getBoundingClientRect().width];
    const move = (next: globalThis.PointerEvent) => onResize?.(column, Math.max(MIN_COLUMN_WIDTH, startWidth + next.clientX - startX));
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };
  return (
    <>
      {onSort ? (
        <button type="button" onClick={() => onSort(column)} className="inline-flex max-w-full items-center gap-1 rounded-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none">
          <span className="truncate">{label}</span>
          {active && <SortIcon className="size-3 shrink-0" aria-hidden="true" />}
          {active && <span className="sr-only">Sorted {sort?.descending ? "descending" : "ascending"}</span>}
        </button>
      ) : label}
      {onResize && <span onPointerDown={startResize} aria-hidden="true" className="absolute inset-y-0 right-0 w-1.5 cursor-col-resize touch-none hover:bg-brand/50" />}
    </>
  );
}

export function Grid({ table, selectedId, select, emptyRows = fullHeightRows - table.rows.length, focusOnLoad = true, xray = false, sort, onSort, widths, onResize, onCopy }: GridProps) {
  const grid = useRef<HTMLTableElement>(null);
  const focused = useRef(focusOnLoad ? null : selectedId);

  useEffect(() => {
    if (selectedId && selectedId !== focused.current) grid.current?.querySelector<HTMLElement>(`[data-cell="${selectedId}"]`)?.focus();
    focused.current = selectedId;
  }, [selectedId]);

  const onKeyDown = (event: KeyboardEvent, rowIndex: number, columnIndex: number) => {
    if (event.key === "Escape") return select(null);
    if (event.key.toLowerCase() === "c" && (event.ctrlKey || event.metaKey) && onCopy) {
      const cell = table.rows[rowIndex]!.cells[table.columns[columnIndex]!.id]!;
      return onCopy(isFound(cell) ? display(cell.value) : "");
    }
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    const row = table.rows[Math.min(Math.max(rowIndex + move[0], 0), table.rows.length - 1)]!;
    const column = table.columns[Math.min(Math.max(columnIndex + move[1], 0), table.columns.length - 1)]!;
    select(cellId(row.key, column.id));
  };

  const activeRow = table.rows.findIndex((row) => table.columns.some((column) => cellId(row.key, column.id) === selectedId));
  const activeColumn = table.columns.findIndex((column) => table.rows.some((row) => cellId(row.key, column.id) === selectedId));
  const header = (active: boolean) => (active ? "bg-selected text-foreground" : "bg-muted");
  const edge = "border-r border-b";
  const frozen = "sticky z-10";
  return (
    <div className="min-h-0 flex-1 scroll-pt-7 scroll-pl-38 overflow-auto sm:scroll-pl-62" role="region" aria-label={table.title}>
      <table ref={grid} role="grid" className="min-w-full border-separate border-spacing-0 text-sm tabular-nums">
        <thead>
          <tr>
            <th className={`${edge} ${frozen} top-0 left-0 z-30 w-10 min-w-10 bg-muted`}><span className="sr-only">Row</span></th>
            <th scope="col" className={`${edge} ${frozen} top-0 left-10 z-30 w-28 min-w-28 bg-muted px-2 py-1 text-left text-xs font-medium text-muted-foreground sm:min-w-52`}>
              <HeaderContent column={NAME_COLUMN} label="Name" sort={sort} onSort={onSort} />
            </th>
            {table.columns.map((column, columnIndex) => (
              <th
                key={column.id}
                scope="col"
                title={column.rule}
                style={widths?.[column.id] ? { width: widths[column.id], minWidth: widths[column.id], maxWidth: widths[column.id] } : undefined}
                aria-sort={sort?.column === column.id ? (sort.descending ? "descending" : "ascending") : undefined}
                className={`${edge} ${frozen} top-0 z-20 overflow-hidden px-2 py-1 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors ${column.type === "number" ? "text-right" : "text-left"} ${header(columnIndex === activeColumn)}`}
              >
                <HeaderContent column={column.id} label={`${column.label}${column.unit ? ` (${column.unit})` : ""}`} sort={sort} onSort={onSort} onResize={onResize} />
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
                const status = statuses[cellStatus(cell, row.key, column.id, table.watch)];
                const StatusIcon = status.icon;
                return (
                  <td
                    key={column.id}
                    role="gridcell"
                    data-cell={id}
                    tabIndex={selectedId === id || (!selectedId && first) ? 0 : -1}
                    aria-selected={selectedId === id}
                    onClick={() => select(id)}
                    onKeyDown={(event) => onKeyDown(event, rowIndex, columnIndex)}
                    title={xray ? status.detail : undefined}
                    // The tint runs down the grid row by row, like a scan.
                    style={{ ...(xray && { transitionDelay: `${rowIndex * 35}ms` }), ...(widths?.[column.id] && { maxWidth: widths[column.id] }) }}
                    className={`${edge} ${xray ? status.tint : ""} max-w-44 cursor-cell truncate px-2 py-1 transition-colors duration-200 hover:bg-muted/50 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset aria-selected:bg-brand/10 aria-selected:ring-2 aria-selected:ring-brand aria-selected:ring-inset sm:max-w-72 ${column.type === "number" ? "text-right" : ""} ${isFound(cell) ? "" : "text-xs text-muted-foreground"}`}
                  >
                    {xray && <StatusIcon className="mr-1.5 inline size-3 align-[-1px] text-foreground/70" aria-label={status.label} />}
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

function TopBar({ table, shown, owner, link, onChanged }: { table?: PublishedTable; shown?: PublishedTable; owner: string; link: string; onChanged: () => void }) {
  const cells = table?.rows.flatMap((row) => Object.values(row.cells)) ?? [];
  const found = cells.filter(isFound);
  const lastRead = found.reduce((latest, cell) => (cell.read > latest ? cell.read : latest), "");
  return (
    <header className="flex shrink-0 items-center gap-3 px-3 py-2">
      <Link href={table ? `/${owner}/${table.slug}` : "/"} aria-label="Back to the table's page" className="shrink-0 rounded-lg transition-transform hover:scale-105 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
        <Logo className="size-9" />
      </Link>
      <div className="min-w-0 flex-1">
        {table ? (
          <>
            <h1 className="truncate text-lg leading-6">{table.private && <Lock aria-label="Private" className="mr-1.5 inline size-3.5 align-[-1px] text-muted-foreground" />}{table.title}</h1>
            <p className="truncate text-xs text-muted-foreground">
              by <Link href={`/${owner}`} className="hover:text-foreground hover:underline">{ownerLabel(table)}</Link> · {found.length} of {cells.length} cells{lastRead && ` · Read ${day(lastRead)}`}
            </p>
          </>
        ) : (
          <p className="text-lg leading-6">Skeletable</p>
        )}
      </div>
      {shown && <DownloadButton table={shown} size="sm" />}
      {table && <ShareButton table={table} path={link} size="sm" onChanged={onChanged} />}
      <AccountButton />
    </header>
  );
}

export function Sheet({ owner, slug }: { owner: string; slug: string }) {
  const { data, status, retry } = useJson<PublishedTable>(`/api/tables/${owner}/${slug}`);
  const [xray, setXray] = useState(false);
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [filtering, setFiltering] = useState(false);
  const [helping, setHelping] = useState(false);
  const findInput = useRef<HTMLInputElement>(null);
  const [path, navigate] = useLocation();
  const search = useSearch();
  const selectedId = new URLSearchParams(search).get("cell");
  const view = useMemo(() => readView(search), [search]);
  const { sort, find, filters } = view;
  const show = (next: Partial<SheetView>, cell = selectedId) => navigate(`${path}${viewSearch({ ...view, ...next }, cell)}`, { replace: true });

  useEffect(() => {
    if (data) document.title = `${data.title} · Skeletable`;
  }, [data]);

  const shown = useMemo(() => (data ? { ...data, rows: sortedRows(data, filteredRows(data, matchingRows(data, find), filters), sort) } : undefined), [data, find, filters, sort]);

  // Letters only act as shortcuts outside anything you can type in or choose from.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || (event.target as HTMLElement).closest("input, textarea, select, [role=dialog], [role=menu]")) return;
      const action = { "/": () => findInput.current?.focus(), f: () => setFiltering(true), x: () => setXray((on) => !on), "?": () => setHelping(true) }[event.key];
      if (!action) return;
      event.preventDefault();
      action();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const row = data?.rows.find((r) => selectedId?.startsWith(cellId(r.key, "")));
  const column = data?.columns.find((c) => row && cellId(row.key, c.id) === selectedId);
  return (
    <div className="flex h-svh flex-col duration-200 animate-in fade-in zoom-in-[0.995] motion-reduce:animate-none">
      <TopBar table={data} shown={shown} owner={owner} link={`${path}${viewSearch(view, selectedId)}`} onChanged={retry} />
      {status === "missing" ? (
        <NoTable />
      ) : status === "failed" ? (
        <Message title="This table didn't load" action={<Button variant="outline" size="sm" onClick={retry}>Try again</Button>} />
      ) : data && shown ? (
        <>
          <FormulaBar table={data} onChanged={retry} selected={row && column ? { rowKey: row.key, column, cell: row.cells[column.id]!, status: cellStatus(row.cells[column.id]!, row.key, column.id, data.watch) } : undefined} />
          <Grid
            table={shown}
            selectedId={selectedId}
            select={(id) => show({}, id)}
            xray={xray}
            sort={sort}
            onSort={(column) => show({ sort: nextSort(sort, column) })}
            widths={widths}
            onResize={(column, width) => setWidths((current) => ({ ...current, [column]: width }))}
            onCopy={(text) => void copyText(text)}
          />
          <StatusBar table={data} xray={xray} onXray={() => setXray(!xray)} onChanged={retry} find={find} onFind={(next) => show({ find: next })} findInput={findInput} filters={filters} onFilters={(next) => show({ filters: next })} filtering={filtering} onFiltering={setFiltering} shown={shown.rows.length} />
        </>
      ) : (
        <div className="flex-1 space-y-2 p-3" aria-label="Loading table">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}
      <Dialog open={helping} onOpenChange={setHelping}>
        <DialogContent>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription className="sr-only">What each key does in the sheet</DialogDescription>
          <Shortcuts />
        </DialogContent>
      </Dialog>
    </div>
  );
}
