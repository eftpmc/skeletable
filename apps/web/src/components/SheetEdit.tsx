import type { Column } from "@skeleton/tables/format";
import { Ellipsis } from "lucide-react";
import { useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";
import { DownloadItems } from "@/components/Download";
import { Field, FormError } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { postJson, sendJson } from "@/lib/api";
import { rowSets } from "@/lib/draft";
import type { PublishedTable } from "@/lib/status";

/** Everything a sheet lets this person do from inside the grid. Each is left out if they can't. */
export type GridEdit = {
  // Says whether the selection should stay put, because the value still needs its proof.
  typeIn: (rowKey: string, column: Column, text: string) => boolean;
  paste?: (rowIndex: number, columnIndex: number, text: string) => void;
  addRow?: (name: string) => Promise<boolean>;
  addColumn?: (heading: string) => void;
  columnMenu?: (column: Column) => void;
  rowMenu?: (rowKey: string) => void;
};

const quietInput = "w-full min-w-0 bg-transparent outline-none placeholder:text-muted-foreground/70";

/** Typing over a cell, as in a spreadsheet. Enter and Tab save and move on, Esc leaves it alone. */
export function CellInput({ initial, numeric, onDone }: { initial: string; numeric: boolean; onDone: (text: string | null, move?: "down" | "right") => void }) {
  const [text, setText] = useState(initial);
  const finished = useRef(false);
  const finish = (result: string | null, move?: "down" | "right") => {
    if (finished.current) return;
    finished.current = true;
    onDone(result, move);
  };
  return (
    <input
      autoFocus
      aria-label="Cell value"
      value={text}
      onChange={(event) => setText(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onBlur={() => finish(text)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") finish(null);
        if (event.key === "Enter" || event.key === "Tab") {
          event.preventDefault();
          finish(text, event.key === "Tab" ? "right" : "down");
        }
      }}
      className={`absolute inset-0 z-10 bg-background px-2 text-sm text-foreground ring-2 ring-brand outline-none ring-inset ${numeric ? "text-right" : ""}`}
    />
  );
}

const moveBetweenNewRows = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
  const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
  if (!step) return;
  event.preventDefault();
  event.currentTarget.closest("table")?.querySelector<HTMLElement>(`[data-new-row="${index + step}"]`)?.focus();
};

/** An empty row's name. Typing one here is how a row gets added. */
export function NewRowInput({ index, onAdd, onPaste }: { index: number; onAdd: (name: string) => Promise<boolean>; onPaste?: (text: string) => void }) {
  const [text, setText] = useState("");
  const add = async () => {
    const name = text.trim();
    if (!name) return;
    setText("");
    if (!(await onAdd(name))) setText(name);
  };
  const paste = (event: ClipboardEvent) => {
    const pasted = event.clipboardData.getData("text");
    if (!onPaste || !/[\t\n]/.test(pasted.trim())) return;
    event.preventDefault();
    onPaste(pasted);
  };
  return (
    <input
      aria-label={`Name of a new row ${index + 1}`}
      data-new-row={index}
      className={`${quietInput} font-medium`}
      placeholder={index === 0 ? "Type a name to add a row" : undefined}
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => void add()}
      onPaste={paste}
      onKeyDown={(event) => {
        if (event.key === "Enter") void add();
        moveBetweenNewRows(event, index);
      }}
    />
  );
}

/** The cell past the last heading. Typing one here is how a column gets added. */
export function NewColumnInput({ onAdd }: { onAdd: (heading: string) => void }) {
  const [text, setText] = useState("");
  const add = () => {
    if (text.trim()) onAdd(text.trim());
    setText("");
  };
  return <input aria-label="Name of a new column" className={`${quietInput} font-medium`} placeholder="Add column" value={text} onChange={(event) => setText(event.target.value)} onBlur={add} onKeyDown={(event) => event.key === "Enter" && add()} />;
}

/** The table's name, edited where it's shown. A draft's address follows it. */
export function TitleInput({ table, onChanged }: { table: PublishedTable; onChanged: () => void }) {
  const [, navigate] = useLocation();
  const [title, setTitle] = useState(table.title);
  const save = async () => {
    const next = title.trim();
    if (!next || next === table.title) return setTitle(table.title);
    const { ok, data } = await sendJson<{ slug: string; error?: string }>("PATCH", `/api/tables/${table.owner}/${table.slug}`, { title: next, question: table.question, topic: table.topic, scope: table.scope });
    if (!ok) return void toast.error(data.error ?? "That didn't save.");
    if (data.slug !== table.slug) navigate(`/${table.owner}/${data.slug}/sheet`, { replace: true });
    else onChanged();
  };
  return (
    <input
      aria-label="Table name"
      autoFocus={table.title === "Untitled table"}
      onFocus={(event) => event.currentTarget.select()}
      size={Math.min(Math.max(title.length, 8), 40)}
      maxLength={120}
      value={title}
      onChange={(event) => setTitle(event.target.value)}
      onBlur={() => void save()}
      onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
      className="min-w-0 rounded-sm bg-transparent px-1 font-medium outline-none hover:bg-muted focus:bg-muted focus:ring-2 focus:ring-brand"
    />
  );
}

/** A column's heading, kind and rule, all in one place. */
export function ColumnDialog({ table, column, label = "", onClose, onChanged }: { table: PublishedTable; column?: Column; label?: string; onClose: () => void; onChanged: () => void }) {
  const [form, setForm] = useState({ label: column?.label ?? label, type: column?.type ?? "text", unit: column?.unit ?? "", rule: column?.rule ?? "" });
  const [error, setError] = useState<string>();
  const base = `/api/tables/${table.owner}/${table.slug}/columns`;
  const proved = !!column && table.rows.some((row) => !("missing" in row.cells[column.id]!));
  const send = async (method: string, path: string, body: unknown, done: string) => {
    const { ok, data } = await sendJson<{ error?: string }>(method, path, body);
    if (!ok) return setError(data.error ?? "That didn't save.");
    toast.success(done);
    onChanged();
    onClose();
  };
  const save = (event: FormEvent) => {
    event.preventDefault();
    void (column ? send("PATCH", `${base}/${column.id}`, form, "Column saved") : send("POST", base, form, "Column added"));
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogTitle>{column ? "Edit column" : "Add column"}</DialogTitle>
        <DialogDescription>{proved ? "This column's values were checked against its type, so its type stays as it is." : "Say what counts, so two readers would fill it in the same way."}</DialogDescription>
        <form onSubmit={save} className="min-w-0 space-y-3">
          <Field label="Heading"><Input required maxLength={80} value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} /></Field>
          <div className="flex gap-3">
            {(!column || (table.draft && !proved)) && (
              <Field label="Kind">
                <NativeSelect value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as Column["type"] })}>
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="boolean">Yes or no</option>
                </NativeSelect>
              </Field>
            )}
            {form.type === "number" && <Field label="Unit"><Input maxLength={30} placeholder="g" value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} /></Field>}
          </div>
          <Field label="What counts"><Input required={!table.draft} maxLength={500} placeholder="Weight as the maker states it" value={form.rule} onChange={(event) => setForm({ ...form, rule: event.target.value })} /></Field>
          <FormError error={error} />
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm">Save</Button>
            {column && <Button type="button" variant="ghost" size="sm" className="ml-auto text-destructive" onClick={() => void send("DELETE", `${base}/${column.id}`, {}, "Column removed")}>Remove column</Button>}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A row's name, and removing it. Past values stay in the history. */
export function RowDialog({ table, rowKey, onClose, onChanged }: { table: PublishedTable; rowKey: string; onClose: () => void; onChanged: () => void }) {
  const [name, setName] = useState(rowKey);
  const [error, setError] = useState<string>();
  const send = async (method: string, body: unknown, done: string) => {
    const { ok, data } = await sendJson<{ error?: string }>(method, `/api/tables/${table.owner}/${table.slug}/rows`, body);
    if (!ok) return setError(data.error ?? "That didn't save.");
    toast.success(done);
    onChanged();
    onClose();
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogTitle>Edit row</DialogTitle>
        <DialogDescription className="sr-only">Rename or remove this row</DialogDescription>
        <form onSubmit={(event) => { event.preventDefault(); void send("PATCH", { key: rowKey, to: name }, "Row renamed"); }} className="min-w-0 space-y-3">
          <Field label="Name"><Input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></Field>
          <FormError error={error} />
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm">Save</Button>
            <Button type="button" variant="ghost" size="sm" className="ml-auto text-destructive" onClick={() => void send("DELETE", { key: rowKey }, "Row removed")}>Remove row</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The sheet's menu, for what isn't a cell: where to go, what to add in bulk, and publishing. */
export function SheetOptions({ table, downloadTable, canRun, onRows, onShortcuts }: { table: PublishedTable; downloadTable?: PublishedTable; canRun: boolean; onRows: (names: string[]) => void; onShortcuts: () => void }) {
  const page = `/${table.owner}/${table.slug}`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Table options"><Ellipsis /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem asChild><Link href={page}>Table page</Link></DropdownMenuItem>
        {canRun && <DropdownMenuItem asChild><Link href={`${page}/settings`}>Details and who can see it</Link></DropdownMenuItem>}
        {canRun && table.draft && <DropdownMenuItem asChild><Link href={page}>Publish</Link></DropdownMenuItem>}
        {canRun && table.draft && (
          <>
            <DropdownMenuSeparator />
            {rowSets.map(({ label, rows }) => <DropdownMenuItem key={label} onSelect={() => onRows(rows)}>Add {label}</DropdownMenuItem>)}
          </>
        )}
        <DropdownMenuSeparator />
        <DownloadItems table={downloadTable ?? table} />
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onShortcuts}>Keyboard shortcuts</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Saves a row's name, for the empty rows at the bottom of a sheet. */
export async function addTableRow(table: PublishedTable, key: string) {
  const { ok, data } = await postJson<{ error?: string }>(`/api/tables/${table.owner}/${table.slug}/rows`, { key });
  if (!ok) toast.error(data.error ?? "That row didn't save.");
  return ok;
}
