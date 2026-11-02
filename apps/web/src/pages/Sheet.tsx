import { aiCellState, aiProgress, matchChoice, rowPrompt, tableSummaries, type ColumnSummary } from "@skeleton/tables/columns";
import { hasValue, isAnswered, isFound, isGiven, parseDay, proofOptional, type Cell, type Column } from "@skeleton/tables/format";
import { ArrowDown, ArrowRight, ArrowUp, BarChart3, ChevronDown, History, Info, Lock, Pencil, ScanLine, Search, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from "react";
import { toast } from "sonner";
import { Link, useLocation, useSearch } from "wouter";
import { SheetSkeleton, Spinner } from "@/components/Loading";
import { Input } from "@/components/ui/input";
import { AgentBuildButton } from "@/components/AgentBuild";
import { ColumnSummaryView } from "@/components/Data";
import { FilterButton } from "@/components/Filter";
import { NoTable } from "@/components/NoTable";
import { CiteButton, Conflicts, OriginDetails, Quote, SourceLink, StatusBadge, kindLabels } from "@/components/Proof";
import { ShareButton } from "@/components/Share";
import { CellInput, ColumnDialog, NewColumnInput, NewRowInput, RowDialog, SheetOptions, addTableRow, type GridEdit } from "@/components/SheetEdit";
import { AppBar } from "@/components/Shell";
import { Shortcuts } from "@/components/Shortcuts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { signInHref } from "@/lib/account";
import { postJson, useJson, useMe } from "@/lib/api";
import { accountName, cellId, day, display, host, ownerLabel, place } from "@/lib/cells";
import { copyText } from "@/lib/copy";
import { rowPath } from "@/lib/cells";
import { gridChange, headingColumn } from "@/lib/draft";
import { NAME_COLUMN, filteredRows, matchingRows, nextSort, readView, sortedRows, viewSearch, type SheetFilters, type SheetSort, type SheetView } from "@/lib/sheet";
import { cellStatus, statusCounts, statuses, type CellStatus, type PublishedTable } from "@/lib/status";
import { Message } from "@/pages/Message";

/** Empty rows carry the grid down the page, as in a spreadsheet. */
const fullHeightRows = 30;

const DRAFT_RELOAD_MS = 2500;

export type Selected = { rowKey: string; column: Column; cell: Cell; status: CellStatus };

/** The cell a selection points at, with how far to trust it. */
export function selectedCell(table: PublishedTable, id: string | null): Selected | undefined {
  const row = table.rows.find((r) => id?.startsWith(cellId(r.key, "")));
  const column = table.columns.find((c) => row && cellId(row.key, c.id) === id);
  if (!row || !column) return undefined;
  const cell = row.cells[column.id]!;
  return { rowKey: row.key, column, cell, status: cellStatus(cell, row.key, column.id, table.watch) };
}

function SuggestButton({ onSuggest, canEdit, label }: { onSuggest: () => void; canEdit: boolean; label?: string }) {
  const { canSignIn, user } = useMe();
  if (!canSignIn) return null;
  if (!user) {
    return (
      <Button variant="ghost" size="xs" asChild>
        <a href={signInHref()}><Pencil />Sign in to suggest</a>
      </Button>
    );
  }
  return <Button variant="ghost" size="xs" onClick={onSuggest}><Pencil />{label ?? (canEdit ? "Edit value" : "Suggest a change")}</Button>;
}

type QuoteSearch = { quotes: string[]; blocked?: "robots" | "unreadable" };

const QUOTE_SEARCH_WAIT_MS = 500;

/** Looks through a source for the words that state a value, once both have settled. */
function useQuoteSearch(table: PublishedTable, column: string, value: string, source: string) {
  const [found, setFound] = useState<{ key: string; result: QuoteSearch }>();
  const key = URL.canParse(source) && value.trim() ? `${value}|${source}` : "";
  useEffect(() => {
    if (!key) return;
    const timer = setTimeout(() => {
      void postJson<QuoteSearch>(`/api/tables/${table.owner}/${table.slug}/quotes`, { column, value, source }).then(({ ok, data }) => ok && setFound({ key, result: data }));
    }, QUOTE_SEARCH_WAIT_MS);
    return () => clearTimeout(timer);
  }, [key, table.owner, table.slug, column, value, source]);
  const result = found?.key === key ? found.result : undefined;
  if (!key) return { quotes: [] };
  if (!result) return { quotes: [], message: "Looking for those words on the page..." };
  if (result.blocked === "robots") return { quotes: [], message: "This site asks bots not to read it, so paste the words yourself." };
  if (result.blocked) return { quotes: [], message: "We couldn't read that page, so paste the words yourself." };
  return { quotes: result.quotes, message: result.quotes.length ? "Pick the sentence that states it:" : "We didn't find that value on the page. Paste the words that show it." };
}

/** Propose a new value with its proof, which the server tests before anyone reviews it. */
function SuggestForm({ table, selected, canEdit, source, typed, onDone }: { table: PublishedTable; selected: Selected; canEdit: boolean; source: string; typed?: string; onDone: (sent: boolean, source: string) => void }) {
  const unproven = "missing" in selected.cell ? selected.cell.unproven : isGiven(selected.cell) ? selected.cell.value : undefined;
  const [form, setForm] = useState({ value: typed ?? (unproven === undefined ? "" : display(unproven)), source, quote: "" });
  const [error, setError] = useState<string>();
  const [sending, setSending] = useState(false);
  const field = (name: keyof typeof form) => ({ value: form[name], onChange: (event: { target: { value: string } }) => setForm({ ...form, [name]: event.target.value }) });
  const search = useQuoteSearch(table, selected.column.id, form.value, form.source);
  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    setError(undefined);
    try {
    const { ok, data } = await postJson<{ error?: string }>(`/api/tables/${table.owner}/${table.slug}/proposals`, { ...form, row: selected.rowKey, column: selected.column.id });

    if (!ok) return setError(data.error ?? "That didn't send. Try again.");
    toast.success(canEdit ? "Value saved" : "Proposal sent");
    onDone(true, form.source);
    } catch { setError("Couldn’t connect. Try saving again."); }
    finally { setSending(false); }
  };
  return (
    <form onSubmit={send} onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Escape") onDone(false, form.source); }} className="space-y-2 border-t px-3 py-2 text-sm duration-150 animate-in fade-in slide-in-from-top-1">
      <p className="text-xs text-muted-foreground">{selected.column.rule}</p>
      <div className="grid gap-2">
        <Input aria-label="New value" autoFocus={!form.value} placeholder={`New value${selected.column.unit ? ` (${selected.column.unit})` : ""}`} required {...field("value")} />
        <Input aria-label="Source link" type="url" autoFocus={!!form.value && !form.source} placeholder="Link to the page that states it" required {...field("source")} />
      </div>
      <Input aria-label="Exact quote" placeholder="The exact words on that page" required maxLength={400} {...field("quote")} />
      {search.message && <p role="status" className="text-xs text-muted-foreground">{search.message}</p>}
      {search.quotes.length > 0 && !form.quote && (
        <ul className="space-y-1" aria-label="Sentences on that page that state this value">
          {search.quotes.map((quote) => (
            <li key={quote}>
              <button type="button" onClick={() => setForm({ ...form, quote })} className="w-full rounded-md border px-2 py-1 text-left text-xs transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none">
                <Quote cell={{ value: selected.column.type === "number" ? Number(form.value.replace(/,/g, "")) : form.value, quote }} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={sending} aria-busy={sending}>{sending && <Spinner label="Checking source" />}{sending ? "Checking the page..." : canEdit ? "Save value" : "Send proposal"}</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => onDone(false, form.source)}>Cancel</Button>
        {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
      </div>
    </form>
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

/** Frequently used controls stay directly above the grid. */
function SheetToolbar({ table, xray, onXray, summaries, onSummaries, onNext, find, onFind, findInput, filters, onFilters, filtering, onFiltering, shown }: { table: PublishedTable; xray: boolean; onXray: () => void; summaries: boolean; onSummaries: () => void; onNext?: () => void; find: string; onFind: (find: string) => void; findInput: RefObject<HTMLInputElement | null>; filters: SheetFilters; onFilters: (filters: SheetFilters) => void; filtering: boolean; onFiltering: (open: boolean) => void; shown: number }) {
  return (
    <div aria-label="Sheet tools" className="flex shrink-0 flex-wrap items-center gap-2 px-3 py-2 text-xs">
      <div className="relative w-32 shrink-0 sm:w-56">
        <Search className="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-muted-foreground" />
        <Input ref={findInput} aria-label="Find in this table" placeholder="Find in table" value={find} onChange={(event) => onFind(event.target.value)} className="h-8 bg-background pl-6 text-xs md:text-xs" />
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
        Show checks
      </Button>
      <Button
        variant="ghost"
        size="xs"
        title="Show what each column holds"
        aria-pressed={summaries}
        onClick={onSummaries}
        className={summaries ? "bg-selected text-foreground hover:bg-selected" : "text-muted-foreground"}
      >
        <BarChart3 />
        Summary
      </Button>
      {onNext && <Button variant="ghost" size="xs" className="shrink-0 text-muted-foreground" onClick={onNext}><ArrowRight />{proofOptional(table) ? "Next empty" : "Next to prove"}</Button>}
    </div>
  );
}

/** Counts and context remain below the sheet, away from editing controls. */
function StatusBar({ table, xray, shown, refreshing, refreshFailed, retry }: { table: PublishedTable; xray: boolean; shown: number; refreshing?: boolean; refreshFailed?: boolean; retry: () => void }) {
  return (
    <footer className="flex min-h-9 shrink-0 flex-wrap items-center gap-3 border-t bg-muted px-3 py-1 text-xs">
      <span className="shrink-0 text-muted-foreground tabular-nums">{shown === table.rows.length ? `${shown} rows` : `${shown} of ${table.rows.length} rows`}</span>
      {xray && <XrayReading table={table} />}
      {refreshing && <Spinner label="Refreshing table" />}
      {refreshFailed && <button onClick={retry} className="text-muted-foreground underline">Update failed · Retry</button>}
      <SheetFacts table={table} />
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="xs" className="shrink-0 text-muted-foreground max-md:ml-auto">
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

/** The page that already proves something else in this row, as a start for the next value. */
function rowSource(table: PublishedTable, rowKey: string) {
  const row = table.rows.find((candidate) => candidate.key === rowKey);
  return Object.values(row?.cells ?? {}).find(isFound)?.source ?? "";
}

/** Above the grid, like a spreadsheet's: one line until a cell is selected, then its evidence opens beneath. */
export function FormulaBar({ selected, table, onChanged, editing, typed, onEditing, onNext, compact = false, frozen = false }: { compact?: boolean; selected?: Selected; table?: PublishedTable; onChanged?: () => void; editing?: boolean; typed?: string; onEditing?: (editing: boolean) => void; onNext?: () => void; frozen?: boolean }) {
  const { user } = useMe();
  // A saved version never changes, so it offers no edits.
  const editable = !!table && !frozen;
  const canEdit = !!table && !!user?.accounts.includes(table.owner);
  const [ownEditing, setOwnEditing] = useState(false);
  const suggesting = editing ?? ownEditing;
  const setSuggesting = onEditing ?? setOwnEditing;
  const [sent, setSent] = useState(false);
  // The last page used, because one page often fills several cells.
  const lastSource = useRef("");
  const cell = selected?.cell;
  const value = !selected || !cell ? undefined : hasValue(cell) ? `${display(cell.value)}${selected.column.unit ? ` ${selected.column.unit}` : ""}` : cell.unproven !== undefined ? `${display(cell.unproven)}${selected.column.unit ? ` ${selected.column.unit}` : ""}` : statuses[selected.status].label;
  return (
    <section className="shrink-0 border-y" aria-live="polite" aria-label="Selected cell">
      <div className={compact ? "space-y-2 px-4 py-3 text-sm" : "flex h-9 items-center text-sm"}>
        <div className={compact ? "pr-6 text-xs text-muted-foreground" : "w-32 shrink-0 truncate border-r px-3 text-xs leading-9 text-muted-foreground sm:w-56"}>
          {selected ? `${selected.rowKey} · ${selected.column.label}` : ""}
        </div>
        {!compact && <span className="px-3 font-serif text-muted-foreground italic" aria-hidden="true">fx</span>}
        <p className={compact ? "text-lg font-semibold break-words" : `min-w-0 flex-1 truncate pr-3 ${value ? "font-medium" : "text-muted-foreground"}`}>{value ?? "Select a cell to see its source"}</p>
      </div>
      {cell && table && suggesting && (
        <SuggestForm
          key={selected.rowKey + selected.column.id + (typed ?? "")}
          table={table}
          selected={selected}
          canEdit={canEdit}
          source={lastSource.current || rowSource(table, selected.rowKey)}
          typed={typed}
          onDone={(done, source) => {
            lastSource.current = source;
            setSent(done && !canEdit);
            if (done) onChanged?.();
            // While building a draft, saving moves straight on to the next cell.
            if (done && table.draft && canEdit && onNext) onNext();
            else setSuggesting(false);
          }}
        />
      )}
      {cell && !suggesting && (
        <div key={selected.rowKey + selected.column.id} className={compact ? "space-y-3 border-t px-4 py-3 text-sm" : "max-h-36 space-y-1.5 overflow-y-auto border-t px-3 py-2 text-sm duration-150 animate-in fade-in slide-in-from-top-1"}>
          {isFound(cell) ? (
            <>
              <Quote cell={cell} />
              <div className="flex flex-wrap items-center gap-1.5">
                <SourceLink url={cell.source} label={host(cell.source)} quote={cell.quote} />
                <Badge variant="secondary">{kindLabels[cell.kind]}</Badge>
                <StatusBadge status={selected.status} />
                {editable && <SuggestButton onSuggest={() => setSuggesting(true)} canEdit={canEdit} />}
                {table && !table.draft && !frozen && <CiteButton cell={cell} address={{ table, rowKey: selected.rowKey, columnId: selected.column.id }} />}
                <Badge variant="outline">Read {day(cell.read)}</Badge>
              </div>
              <Conflicts cell={cell} />
            </>
          ) : isGiven(cell) ? (
            <OriginDetails
              cell={cell}
              status={selected.status}
              prompt={aiPrompt(table, selected)}
              actions={editable && (
                <>
                  <SuggestButton onSuggest={() => setSuggesting(true)} canEdit={canEdit} label={canEdit ? "Add proof" : undefined} />
                  {!table.draft && <CiteButton address={{ table, rowKey: selected.rowKey, columnId: selected.column.id }} />}
                </>
              )}
            />
          ) : (
            <>
              <p className="text-muted-foreground">{cell.unproven !== undefined ? "This has no proof yet, so it doesn't count. Add the page that states it." : cell.absent ? `We read this source on ${day(cell.read)} and it gives no such value.` : cell.checked.length ? `No source we could use stated this. We looked here on ${day(cell.read)}:` : "Nobody has looked for this yet."}</p>
              <div className="flex flex-wrap gap-1.5">
                {cell.checked.map((url) => <SourceLink key={url} url={url} label={place(url)} />)}
                {editable && <SuggestButton onSuggest={() => setSuggesting(true)} canEdit={canEdit} label={canEdit ? "Add proof" : undefined} />}
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

/** For a value an AI column generated, the prompt its row asked, and whether that has changed since. */
function aiPrompt(table: PublishedTable | undefined, selected: Selected) {
  const row = table?.rows.find((candidate) => candidate.key === selected.rowKey);
  const cell = selected.cell;
  if (!table || !row || !selected.column.instruction || !isGiven(cell) || !cell.basis) return undefined;
  return { text: rowPrompt(table, selected.column, row)!.prompt, stale: aiCellState(table, selected.column, row) === "stale" };
}

/** What a cell holds, for editing it. */
const cellText = (cell: Cell) => (hasValue(cell) ? display(cell.value) : cell.unproven !== undefined ? display(cell.unproven) : "");

const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

type GridProps = {
  table: PublishedTable;
  selectedId: string | null;
  select: (id: string | null) => void;
  emptyRows?: number;
  cellDetails?: ReactNode;
  focusOnLoad?: boolean;
  xray?: boolean;
  // Sorting, resizing and copying only happen in the full sheet, so previews leave these out.
  sort?: SheetSort;
  onSort?: (column: string) => void;
  widths?: Record<string, number>;
  onResize?: (column: string, width: number) => void;
  onCopy?: (text: string) => void;
  rowHref?: (key: string) => string;
  edit?: GridEdit;
  // A row under the headings showing what each column holds.
  summaries?: Record<string, ColumnSummary>;
};

const MIN_COLUMN_WIDTH = 64;

/** A column heading that sorts when clicked, and resizes from its right edge. */
function HeaderContent({ column, label, sort, onSort, onResize, onMenu }: { column: string; label: ReactNode; sort?: SheetSort; onSort?: (column: string) => void; onResize?: (column: string, width: number) => void; onMenu?: () => void }) {
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
      {onMenu && <button type="button" aria-label="Edit this column" onClick={onMenu} className="ml-1 rounded-sm align-[-1px] opacity-0 group-hover:opacity-100 max-md:opacity-70 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"><ChevronDown className="size-3" /></button>}
      {onResize && <span onPointerDown={startResize} aria-hidden="true" className="absolute inset-y-0 right-0 w-1.5 cursor-col-resize touch-none hover:bg-brand/50" />}
    </>
  );
}

/** An AI column's mark in its heading, with how much is waiting for the agent. */
function AiMark({ table, column }: { table: PublishedTable; column: Column }) {
  const progress = aiProgress(table, column);
  const waiting = progress.pending + progress.stale;
  return (
    <span title={`AI column: ${column.instruction}${column.choices ? `\nAnswers: ${column.choices.join(", ")}` : ""}${waiting ? `\n${waiting} waiting for your agent` : ""}`} className="mr-1 inline-flex items-center gap-0.5 align-[-2px] text-indigo-500">
      <Sparkles className="size-3" aria-label="AI column" />
      {waiting > 0 && <span className="text-[10px] tabular-nums">{waiting}</span>}
    </span>
  );
}

export function Grid({ table, selectedId, select, emptyRows = 0, focusOnLoad = true, xray = false, sort, onSort, widths, onResize, onCopy, rowHref, edit, cellDetails, summaries }: GridProps) {
  const grid = useRef<HTMLTableElement>(null);
  const focused = useRef(focusOnLoad ? null : selectedId);
  const [typing, setTyping] = useState<{ id: string; text: string } | null>(null);

  useEffect(() => {
    if (selectedId && selectedId !== focused.current) grid.current?.querySelector<HTMLElement>(`[data-cell="${selectedId}"]`)?.focus();
    focused.current = selectedId;
  }, [selectedId]);

  const onKeyDown = (event: KeyboardEvent, rowIndex: number, columnIndex: number) => {
    if (event.key === "Escape") return select(null);
    if (edit && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const cell = table.rows[rowIndex]!.cells[table.columns[columnIndex]!.id]!;
      const id = cellId(table.rows[rowIndex]!.key, table.columns[columnIndex]!.id);
      const start = (text: string) => {
        event.preventDefault();
        event.stopPropagation();
        setTyping({ id, text });
      };
      if (event.key === "Enter" || event.key === "F2") return start(cellText(cell));
      if (event.key.length === 1) return start(event.key);
      if ((event.key === "Delete" || event.key === "Backspace") && (("missing" in cell && cell.unproven !== undefined) || isGiven(cell))) {
        edit.typeIn(table.rows[rowIndex]!.key, table.columns[columnIndex]!, "");
        return;
      }
    }
    if (event.key.toLowerCase() === "c" && (event.ctrlKey || event.metaKey) && onCopy) {
      const cell = table.rows[rowIndex]!.cells[table.columns[columnIndex]!.id]!;
      return onCopy(hasValue(cell) ? display(cell.value) : "");
    }
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    if (move[0] === 1 && rowIndex === table.rows.length - 1 && edit?.addRow) return void grid.current?.querySelector<HTMLElement>(`[data-new-row="0"]`)?.focus();
    const row = table.rows[Math.min(Math.max(rowIndex + move[0], 0), table.rows.length - 1)]!;
    const column = table.columns[Math.min(Math.max(columnIndex + move[1], 0), table.columns.length - 1)]!;
    select(cellId(row.key, column.id));
  };

  /** A finished edit: saves it, then moves on as a spreadsheet does, unless the value still needs its proof. */
  const finishTyping = (rowIndex: number, columnIndex: number, id: string, text: string | null, move?: "down" | "right") => {
    setTyping(null);
    const stay = text !== null && edit!.typeIn(table.rows[rowIndex]!.key, table.columns[columnIndex]!, text);
    const row = table.rows[rowIndex + (move === "down" ? 1 : 0)];
    const column = table.columns[columnIndex + (move === "right" ? 1 : 0)];
    if (!stay && move && row && column) select(cellId(row.key, column.id));
    else if (!stay && move === "down" && edit?.addRow) grid.current?.querySelector<HTMLElement>(`[data-new-row="0"]`)?.focus();
    else if (text === null || move) grid.current?.querySelector<HTMLElement>(`[data-cell="${id}"]`)?.focus();
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
                onDoubleClick={edit?.columnMenu && (() => edit.columnMenu!(column))}
                className={`group ${edge} ${frozen} top-0 z-20 overflow-hidden px-2 py-1 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors ${column.type === "number" ? "text-right" : "text-left"} ${header(columnIndex === activeColumn)}`}
              >
                <HeaderContent column={column.id} label={<>{column.instruction && <AiMark table={table} column={column} />}{`${column.label}${column.unit ? ` (${column.unit})` : ""}`}</>} sort={sort} onSort={onSort} onResize={onResize} onMenu={edit?.columnMenu && (() => edit.columnMenu!(column))} />
              </th>
            ))}
            <th className={`${frozen} top-0 w-full min-w-32 border-b bg-muted px-2 py-1 text-left text-xs font-medium`} aria-hidden={edit?.addColumn ? undefined : true}>
              {edit?.addColumn && <NewColumnInput onAdd={edit.addColumn} />}
            </th>
          </tr>
          {summaries && (
            <tr className="duration-150 animate-in fade-in">
              <th className={`${edge} sticky left-0 z-20 bg-muted`} aria-hidden="true" />
              <th scope="row" className={`${edge} sticky left-10 z-20 bg-muted px-2 py-1.5 text-left align-top text-xs font-normal text-muted-foreground`}>{table.rows.length} rows</th>
              {table.columns.map((column) => (
                <td key={column.id} className={`${edge} bg-muted/60 px-2 py-1.5 align-top`} style={widths?.[column.id] ? { maxWidth: widths[column.id] } : undefined}>
                  <div className="max-w-44 sm:max-w-72"><ColumnSummaryView summary={summaries[column.id]!} column={column} compact /></div>
                </td>
              ))}
              <td className="border-b bg-muted/60" />
            </tr>
          )}
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr key={row.key}>
              <td className={`${edge} ${frozen} left-0 text-center text-xs text-muted-foreground transition-colors ${header(rowIndex === activeRow)}`}>
                {edit?.rowMenu ? <button type="button" aria-label={`Edit row ${row.key}`} onClick={() => edit.rowMenu!(row.key)} className="w-full rounded-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none">{rowIndex + 1}</button> : rowIndex + 1}
              </td>
              <th scope="row" className={`${edge} sticky left-10 z-10 max-w-28 bg-background px-2 py-1 text-left font-medium sm:max-w-none sm:whitespace-nowrap`}>
                {rowHref ? <Link href={rowHref(row.key)} className="hover:underline">{row.key}</Link> : row.key}
              </th>
              {table.columns.map((column, columnIndex) => {
                const cell = row.cells[column.id]!;
                const id = cellId(row.key, column.id);
                const first = rowIndex === 0 && columnIndex === 0;
                const statusName = cellStatus(cell, row.key, column.id, table.watch);
                const status = statuses[statusName];
                const StatusIcon = status.icon;
                const content = (
                  <td
                    key={column.id}
                    role="gridcell"
                    data-cell={id}
                    tabIndex={selectedId === id || (!selectedId && first) ? 0 : -1}
                    aria-selected={selectedId === id}
                    onClick={() => select(id)}
                    onKeyDown={(event) => onKeyDown(event, rowIndex, columnIndex)}
                    onDoubleClick={edit && (() => setTyping({ id, text: cellText(cell) }))}
                    onPaste={edit?.paste && ((event) => {
                      event.preventDefault();
                      edit.paste!(rowIndex, columnIndex, event.clipboardData.getData("text"));
                    })}
                    title={isFound(cell) ? `${status.label}: ${cell.quote}` : isGiven(cell) ? `${status.label}${cell.note ? `: ${cell.note}` : ""}` : status.detail}
                    // The tint runs down the grid row by row, like a scan.
                    style={{ ...(xray && { transitionDelay: `${rowIndex * 35}ms` }), ...(widths?.[column.id] && { maxWidth: widths[column.id] }) }}
                    className={`${edge} ${xray ? status.tint : ""} relative max-w-44 cursor-cell truncate px-2 py-1 transition-colors duration-200 hover:bg-muted/50 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset aria-selected:bg-brand/10 aria-selected:ring-2 aria-selected:ring-brand aria-selected:ring-inset sm:max-w-72 ${column.type === "number" ? "text-right" : ""} ${hasValue(cell) ? "" : "text-xs text-muted-foreground"}`}
                  >
                    {typing?.id === id && <CellInput initial={typing.text} numeric={column.type === "number"} choices={column.choices} placeholder={column.type === "date" ? "2026-10-28" : undefined} onDone={(text, move) => finishTyping(rowIndex, columnIndex, id, text, move)} />}
                    {xray && <StatusIcon className="mr-1.5 inline size-3 align-[-1px] text-foreground/70" aria-label={status.label} />}
                    {!xray && status.corner && <span aria-hidden="true" className={`absolute top-0 right-0 size-0 border-t-[7px] border-l-[7px] border-l-transparent ${status.corner}`} />}
                    {hasValue(cell) ? (
                      <span key={statusName} className={table.draft ? "duration-700 animate-in fade-in" : undefined}>{display(cell.value)}</span>
                    ) : cell.unproven !== undefined ? (
                      <span className="text-sm italic">{display(cell.unproven)}</span>
                    ) : statusName === "blank" && !xray ? (
                      <>
                        <span className="sr-only">{status.label}</span>
                        <span aria-hidden="true" className={`block text-muted-foreground/50 ${column.type === "number" ? "text-right" : ""}`}>—</span>
                      </>
                    ) : (
                      status.label
                    )}
                  </td>
                );
                if (!cellDetails) return content;
                return (
                  <Popover key={column.id} open={selectedId === id && typing?.id !== id} onOpenChange={(open) => { if (!open && selectedId === id) select(null); }}>
                    <PopoverAnchor asChild>{content}</PopoverAnchor>
                    {selectedId === id && <PopoverContent aria-label="Cell details" side="bottom" align="start" sideOffset={8} collisionPadding={12} className="relative max-h-[min(28rem,70svh)] w-96 max-w-[calc(100vw-1.5rem)] gap-0 overflow-y-auto p-0"
                      onOpenAutoFocus={(event) => event.preventDefault()}
                      onCloseAutoFocus={(event) => event.preventDefault()}
                      onInteractOutside={(event) => { if ((event.target as HTMLElement)?.closest('[data-cell]')) event.preventDefault(); }}
                    >
                      <Button variant="ghost" size="icon-sm" className="absolute top-1 right-1" aria-label="Close cell details" onClick={() => select(null)}><X /></Button>
                      {cellDetails}
                    </PopoverContent>}
                  </Popover>
                );
              })}
              <td className="border-b" aria-hidden="true" />
            </tr>
          ))}
          {Array.from({ length: Math.max(emptyRows, 0) }, (_, index) => (
            <tr key={index} aria-hidden={edit?.addRow ? undefined : true}>
              <td className={`${edge} ${frozen} left-0 bg-muted text-center text-xs text-muted-foreground`}>{table.rows.length + index + 1}</td>
              <td className={`${edge} sticky left-10 z-10 bg-background px-2 py-1`}>
                {edit?.addRow ? <NewRowInput index={index} onAdd={edit.addRow} onPaste={edit.paste && ((text) => edit.paste!(table.rows.length + index, -1, text))} /> : <>&nbsp;</>}
              </td>
              {table.columns.map((column) => <td key={column.id} className={edge} />)}
              <td className="border-b" />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The sheet's size and age, kept quiet at the end of the status bar. */
function SheetFacts({ table }: { table: PublishedTable }) {
  const cells = table.rows.flatMap((row) => Object.values(row.cells));
  const lastRead = cells.filter(isFound).reduce((latest, cell) => (cell.read > latest ? cell.read : latest), "");
  return <span className="ml-auto hidden shrink-0 text-muted-foreground tabular-nums md:inline">{cells.filter(isAnswered).length} of {cells.length} cells{lastRead && ` · Read ${day(lastRead)}`}</span>;
}

type VersionedTable = PublishedTable & { version?: { number: number; note: string; created: string; rows: number; changes?: { rowsAdded: number; rowsRemoved: number; valuesChanged: number } } };

/** What a saved version is, above its frozen sheet, with the way back to the live table. */
function VersionBanner({ table }: { table: VersionedTable }) {
  const { version } = table;
  if (!version) return null;
  const changes = version.changes;
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const changed = changes && [changes.rowsAdded && count(changes.rowsAdded, "row added", "rows added"), changes.rowsRemoved && count(changes.rowsRemoved, "row removed", "rows removed"), changes.valuesChanged && count(changes.valuesChanged, "value changed", "values changed")].filter(Boolean).join(", ");
  return (
    <div role="note" className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b bg-indigo-500/10 px-3 py-2 text-sm">
      <History className="size-4 text-indigo-500" />
      <span className="font-medium">Version {version.number}</span>
      <span className="text-muted-foreground">Saved {day(version.created)}{version.note ? ` · ${version.note}` : ""}{changed ? ` · Since v${version.number - 1}: ${changed}` : ""}. It never changes.</span>
      <Link href={`/${table.owner}/${table.slug}/sheet`} className="ml-auto font-medium underline underline-offset-2">Open the live table</Link>
    </div>
  );
}

export function Sheet({ owner, slug, version }: { owner: string; slug: string; version?: number }) {
  const { data, status, retry, refreshing, refreshFailed } = useJson<VersionedTable>(version ? `/api/tables/${owner}/${slug}/versions/${version}` : `/api/tables/${owner}/${slug}`);
  const { user } = useMe();
  const [xray, setXray] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [filtering, setFiltering] = useState(false);
  const [helping, setHelping] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pendingSaves, setPendingSaves] = useState(0);
  const [typed, setTyped] = useState<string>();
  const [columnEdit, setColumnEdit] = useState<{ column?: Column; label?: string } | null>(null);
  const [rowEdit, setRowEdit] = useState<string | null>(null);
  const findInput = useRef<HTMLInputElement>(null);
  const [path, navigate] = useLocation();
  const search = useSearch();
  const selectedId = new URLSearchParams(search).get("cell");
  const view = useMemo(() => readView(search), [search]);
  const { sort, find, filters } = view;
  const show = (next: Partial<SheetView>, cell = selectedId) => navigate(`${path}${viewSearch({ ...view, ...next }, cell)}`, { replace: true });

  useEffect(() => {
    if (data) document.title = `${data.title}${version ? ` v${version}` : ""} · Skeletable`;
  }, [data, version]);

  // A draft can be filling up from an agent, so it keeps itself current while someone's looking.
  const reload = useRef(retry);
  reload.current = retry;
  const isDraft = !!data?.draft && !version;
  useEffect(() => {
    if (!isDraft) return;
    const timer = setInterval(() => {
      if (!document.hidden) reload.current();
    }, DRAFT_RELOAD_MS);
    return () => clearInterval(timer);
  }, [isDraft]);

  const shown = useMemo(() => (data ? { ...data, rows: sortedRows(data, filteredRows(data, matchingRows(data, find), filters), sort) } : undefined), [data, find, filters, sort]);

  /** The next cell along that still needs a value or its proof, starting again from the top at the end. */
  const nextOpen = () => {
    if (!shown) return undefined;
    const cells = shown.rows.flatMap((candidate) => shown.columns.map((column) => {
      const name = cellStatus(candidate.cells[column.id]!, candidate.key, column.id, shown.watch);
      return { id: cellId(candidate.key, column.id), open: name === "blank" || name === "unproven" };
    }));
    const at = cells.findIndex((cell) => cell.id === selectedId);
    return [...cells.slice(at + 1), ...cells.slice(0, Math.max(at, 0))].find((cell) => cell.open)?.id;
  };
  const goNext = useRef(() => {});
  goNext.current = () => {
    setTyped(undefined);
    const next = nextOpen();
    if (next) show({}, next);
    else setEditing(false);
  };

  // Letters only act as shortcuts outside anything you can type in or choose from.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || (event.target as HTMLElement).closest?.("input, textarea, select, [role=dialog], [role=menu]")) return;
      const action = { "/": () => findInput.current?.focus(), f: () => setFiltering(true), n: () => goNext.current(), x: () => setXray((on) => !on), "?": () => setHelping(true) }[event.key];
      if (!action) return;
      event.preventDefault();
      action();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // A saved version is only for reading.
  const canRun = !!data && !data.managed && !version && !!user?.accounts.includes(data.owner);
  const canAdd = canRun && data.draft;
  // Where proof is optional, typed values count as entered, so they go straight in even once it's published.
  const canType = canRun && (data.draft || proofOptional(data));
  const tableApi = `/api/tables/${owner}/${slug}`;
  const saveGrid = async (change: ReturnType<typeof gridChange> | { cells: { row: string; column: string; value: string }[] }) => {
    setPendingSaves((count) => count + 1);
    try {
      const { ok, data: result } = await postJson<{ error?: string }>(`${tableApi}/grid`, change);
      if (!ok) toast.error(result.error ?? "That didn't save. Try again.");
      else { toast.success("Saved"); retry(); }
    } catch { toast.error("Couldn't connect. Your changes weren't saved. Try again."); }
    finally { setPendingSaves((count) => count - 1); }
  };
  // Values go straight in while a table is a draft or its proof is optional. Otherwise a person types the value and the formula bar asks for its proof.
  const typeIn: GridEdit["typeIn"] = (rowKey, column, text) => {
    const cell = data!.rows.find((candidate) => candidate.key === rowKey)!.cells[column.id]!;
    if (text.trim() === cellText(cell)) return false;
    if (canType && !isFound(cell)) {
      // Said here, since the server quietly skips a value its column can't take.
      const refused = !text.trim() ? undefined : column.choices && !matchChoice(column, text) ? `${column.label} takes one of: ${column.choices.join(", ")}` : column.type === "date" && !parseDay(text) ? `Write ${column.label} as a date, like 2026-10-28` : undefined;
      if (refused) {
        toast.error(refused);
        return false;
      }
      void saveGrid({ cells: [{ row: rowKey, column: column.id, value: text }] });
      return false;
    }
    if (!text.trim()) return false;
    setTyped(text);
    setEditing(true);
    show({}, cellId(rowKey, column.id));
    return true;
  };
  /** A paste lands where it was dropped, even in a sorted or filtered view. */
  const paste = (rowIndex: number, columnIndex: number, text: string) => {
    const key = shown?.rows[rowIndex]?.key;
    const at = key ? data!.rows.findIndex((row) => row.key === key) : data!.rows.length + rowIndex - shown!.rows.length;
    void saveGrid(gridChange(data!, at, columnIndex, text));
  };
  const summaries = useMemo(() => (summarizing && shown ? tableSummaries(shown) : undefined), [summarizing, shown]);
  const gridEdit: GridEdit | undefined = data && user && !version ? {
    typeIn,
    ...(canType && { paste }),
    ...(canRun && {
      addRow: async (name: string) => {
        const ok = await addTableRow(data, name);
        retry();
        return ok;
      },
      addColumn: (heading: string) => {
        if (!canAdd) return setColumnEdit({ label: heading });
        void postJson<{ error?: string }>(`${tableApi}/columns`, { ...headingColumn(heading), rule: "" }).then(({ ok, data: result }) => {
          if (!ok) toast.error(result.error ?? "That column didn't save.");
          retry();
        });
      },
      columnMenu: (column: Column) => setColumnEdit({ column }),
      rowMenu: setRowEdit,
    }),
  } : undefined;

  return (
    <div className="flex h-svh flex-col duration-200 animate-in fade-in zoom-in-[0.995] motion-reduce:animate-none">
      <AppBar
        workspace
        crumbs={[{ label: data ? ownerLabel(data) : accountName(owner), href: `/${owner}` }, { label: data?.title ?? "Table", href: `/${owner}/${slug}` }, { label: version ? `Version ${version}` : "Sheet" }]}
        phoneTitle="Sheet"
        actions={
          <>
            {pendingSaves > 0 && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Spinner label="Saving changes" />Saving</span>}
            {data?.private && <Lock aria-label="Private" className="size-4 text-muted-foreground" />}
            {data && !version && user?.accounts.includes(data.owner) && <AgentBuildButton table={data} label="Use agent" size="default" />}
            {data && <SheetOptions table={data} downloadTable={shown} canRun={canRun} onRows={(names) => void saveGrid({ addColumns: [], addRows: names, cells: [] })} onShortcuts={() => setHelping(true)} onChanged={retry} />}
            {data && !data.draft && !version && <ShareButton table={data} path={`${path}${viewSearch(view, selectedId)}`} size="sm" onChanged={retry} />}
          </>
        }
      />
      {status === "missing" ? (
        <NoTable />
      ) : status === "failed" ? (
        <Message title="This table didn't load" action={<Button variant="outline" size="sm" onClick={retry}>Try again</Button>} />
      ) : data && shown ? (
        <>
          <VersionBanner table={data} />
          <SheetToolbar table={data} xray={xray} onXray={() => setXray(!xray)} summaries={summarizing} onSummaries={() => setSummarizing(!summarizing)} onNext={data.draft && canRun ? () => goNext.current() : undefined} find={find} onFind={(next) => show({ find: next })} findInput={findInput} filters={filters} onFilters={(next) => show({ filters: next })} filtering={filtering} onFiltering={setFiltering} shown={shown.rows.length} />

          <Grid
            cellDetails={<FormulaBar compact frozen={!!version} table={data} onChanged={retry} selected={selectedCell(data, selectedId)} editing={editing} typed={typed} onEditing={(on) => { setEditing(on); if (!on) setTyped(undefined); }} onNext={() => goNext.current()} />}
            summaries={summaries}
            table={shown}
            selectedId={selectedId}
            select={(id) => { setEditing(false); setTyped(undefined); show({}, id); }}
            xray={xray}
            sort={sort}
            onSort={(column) => show({ sort: nextSort(sort, column) })}
            widths={widths}
            onResize={(column, width) => setWidths((current) => ({ ...current, [column]: width }))}
            onCopy={(text) => void copyText(text)}
            edit={gridEdit}
            emptyRows={data.draft ? Math.max(fullHeightRows - shown.rows.length, gridEdit?.addRow ? 5 : 0) : gridEdit?.addRow ? 1 : 0}
            rowHref={(key) => rowPath(data, key)}
          />
          <StatusBar table={data} xray={xray} shown={shown.rows.length} refreshing={refreshing} refreshFailed={refreshFailed} retry={retry} />
        </>
      ) : (
        <SheetSkeleton />
      )}
      {data && columnEdit && <ColumnDialog {...columnEdit} table={data} onClose={() => setColumnEdit(null)} onChanged={retry} />}
      {data && rowEdit && <RowDialog key={rowEdit} table={data} rowKey={rowEdit} onClose={() => setRowEdit(null)} onChanged={retry} />}
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
