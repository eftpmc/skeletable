import { Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { ConfirmButton, Field, FormError, List, PageHeader, Section } from "@/components/Layout";
import { ManageAccess } from "@/components/Share";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ownsAccount } from "@/lib/account";
import { postJson, sendJson, useMe } from "@/lib/api";
import type { PublishedTable } from "@/lib/status";

type Props = { table: PublishedTable; onChanged: () => void };

const ROWS_SHOWN = 50;

const useSave = (table: PublishedTable, onChanged: () => void) => {
  const [error, setError] = useState<string>();
  const save = async (method: string, path: string, body: unknown, done: string) => {
    const { ok, data } = await sendJson<{ error?: string }>(method, `/api/tables/${table.owner}/${table.slug}${path}`, body);
    if (!ok) {
      setError(data.error ?? "That didn't save.");
      return false;
    }
    setError(undefined);
    toast.success(done);
    onChanged();
    return true;
  };
  return { error, save };
};

function Details({ table, onChanged }: Props) {
  const [form, setForm] = useState({ title: table.title, question: table.question, topic: table.topic, scope: table.scope });
  const { error, save } = useSave(table, onChanged);
  const field = (name: keyof typeof form) => ({ value: form[name], onChange: (event: { target: { value: string } }) => setForm({ ...form, [name]: event.target.value }) });
  return (
    <form onSubmit={(event: FormEvent) => { event.preventDefault(); void save("PATCH", "", form, "Details saved"); }} className="space-y-4">
      <Field label="Title" hint="The table's address stays the same, so links keep working."><Input required maxLength={120} {...field("title")} /></Field>
      <Field label="Question it answers"><Input required maxLength={300} {...field("question")} /></Field>
      <Field label="Topic"><Input required maxLength={40} {...field("topic")} /></Field>
      <Field label="What it covers"><Textarea required rows={3} maxLength={800} {...field("scope")} /></Field>
      <FormError error={error} />
      <Button type="submit" variant="outline">Save</Button>
    </form>
  );
}

function ColumnRow({ table, column, onSave }: { table: PublishedTable; column: PublishedTable["columns"][number]; onSave: ReturnType<typeof useSave>["save"] }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ label: column.label, unit: column.unit ?? "", rule: column.rule });
  if (editing) {
    return (
      <li className="space-y-2 px-3 py-2">
        <form
          className="space-y-2"
          onSubmit={async (event: FormEvent) => {
            event.preventDefault();
            if (await onSave("PATCH", `/columns/${column.id}`, form, "Column saved")) setEditing(false);
          }}
        >
          <div className="flex gap-2">
            <Input aria-label="Column name" required maxLength={80} value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} />
            {column.type === "number" && <Input aria-label="Unit" className="w-24" maxLength={30} placeholder="Unit" value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} />}
          </div>
          <Input aria-label="Rule" required maxLength={500} value={form.rule} onChange={(event) => setForm({ ...form, rule: event.target.value })} />
          <div className="flex gap-2">
            <Button type="submit" size="sm">Save</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </form>
      </li>
    );
  }
  return (
    <li className="flex items-center gap-2 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{column.label}{column.unit ? <span className="font-normal text-muted-foreground"> ({column.unit})</span> : null}</p>
        <p className="truncate text-xs text-muted-foreground">{column.rule}</p>
      </div>
      <Button variant="ghost" size="icon-sm" aria-label={`Edit ${column.label}`} onClick={() => setEditing(true)}><Pencil /></Button>
      {table.columns.length > 1 && <Button variant="ghost" size="icon-sm" aria-label={`Remove ${column.label}`} onClick={() => onSave("DELETE", `/columns/${column.id}`, {}, "Column removed")}><Trash2 /></Button>}
    </li>
  );
}

function Columns({ table, onChanged }: Props) {
  const blank = { label: "", type: "text", unit: "", rule: "" };
  const [form, setForm] = useState(blank);
  const { error, save } = useSave(table, onChanged);
  const add = async (event: FormEvent) => {
    event.preventDefault();
    if (await save("POST", "/columns", form, "Column added")) setForm(blank);
  };
  return (
    <>
      <List label="Columns">{table.columns.map((column) => <ColumnRow key={column.id} table={table} column={column} onSave={save} />)}</List>
      <form onSubmit={add} className="space-y-2 rounded-xl border p-3">
        <div className="flex flex-wrap gap-2">
          <Input className="min-w-40 flex-1" aria-label="New column name" placeholder="Name, like Weight" required maxLength={80} value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} />
          <NativeSelect aria-label="New column type" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
            <option value="text">Text</option>
            <option value="number">Number</option>
            <option value="boolean">Yes or no</option>
          </NativeSelect>
          {form.type === "number" && <Input aria-label="New column unit" className="w-24" maxLength={30} placeholder="Unit" value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} />}
        </div>
        <Input aria-label="New column rule" required maxLength={500} placeholder="What counts, like Weight as the maker states it" value={form.rule} onChange={(event) => setForm({ ...form, rule: event.target.value })} />
        <Button type="submit" variant="outline" size="sm"><Plus />Add column</Button>
      </form>
      <FormError error={error} />
    </>
  );
}

function RowItem({ rowKey, canRemove, onSave }: { rowKey: string; canRemove: boolean; onSave: ReturnType<typeof useSave>["save"] }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(rowKey);
  if (editing) {
    return (
      <li className="px-3 py-2">
        <form
          className="flex gap-2"
          onSubmit={async (event: FormEvent) => {
            event.preventDefault();
            if (await onSave("PATCH", "/rows", { key: rowKey, to: name }, "Row renamed")) setEditing(false);
          }}
        >
          <Input aria-label="Row name" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} />
          <Button type="submit" size="sm">Save</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
        </form>
      </li>
    );
  }
  return (
    <li className="flex items-center gap-2 px-3 py-1.5">
      <span className="min-w-0 flex-1 truncate">{rowKey}</span>
      <Button variant="ghost" size="icon-sm" aria-label={`Rename ${rowKey}`} onClick={() => setEditing(true)}><Pencil /></Button>
      {canRemove && <Button variant="ghost" size="icon-sm" aria-label={`Remove ${rowKey}`} onClick={() => onSave("DELETE", "/rows", { key: rowKey }, "Row removed")}><Trash2 /></Button>}
    </li>
  );
}

function Rows({ table, onChanged }: Props) {
  const [find, setFind] = useState("");
  const [name, setName] = useState("");
  const { error, save } = useSave(table, onChanged);
  const matches = useMemo(() => table.rows.filter((row) => row.key.toLowerCase().includes(find.trim().toLowerCase())), [table.rows, find]);
  const add = async (event: FormEvent) => {
    event.preventDefault();
    const { ok, data } = await postJson<{ error?: string }>(`/api/tables/${table.owner}/${table.slug}/rows`, { key: name });
    if (!ok) return void toast.error(data.error ?? "That didn't save.");
    toast.success("Row added");
    setName("");
    onChanged();
  };
  return (
    <>
      <form onSubmit={add} className="flex gap-2">
        <Input aria-label="New row name" placeholder="New row name" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} />
        <Button type="submit" variant="outline"><Plus />Add row</Button>
      </form>
      {table.rows.length > 8 && <Input aria-label="Find a row" placeholder="Find a row" value={find} onChange={(event) => setFind(event.target.value)} />}
      <List label="Rows">{matches.slice(0, ROWS_SHOWN).map((row) => <RowItem key={row.key} rowKey={row.key} canRemove={table.rows.length > 1} onSave={save} />)}</List>
      {matches.length > ROWS_SHOWN && <p className="text-xs text-muted-foreground">Showing {ROWS_SHOWN} of {matches.length}. Use Find to reach the rest.</p>}
      <FormError error={error} />
    </>
  );
}

function DeleteTable({ table }: { table: PublishedTable }) {
  const [, navigate] = useLocation();
  const [error, setError] = useState<string>();
  const remove = async () => {
    const { ok, data } = await sendJson<{ error?: string }>("DELETE", `/api/tables/${table.owner}/${table.slug}`);
    if (!ok) return setError(data.error ?? "That didn't delete.");
    toast.success(`Deleted ${table.title}`);
    navigate("/");
  };
  return (
    <Section title="Delete this table" description="This removes the table, its history and its proposals for good.">
      <ConfirmButton label="Delete table" confirm={`Delete ${table.title}`} onConfirm={remove} />
      <FormError error={error} />
    </Section>
  );
}

/** Everything about a table that isn't a value: its details, its shape, and who can see it. */
export function TableSettings({ table, onChanged }: Props) {
  const { user } = useMe();
  const owner = ownsAccount(user, table.owner);
  const back = { href: `/${table.owner}/${table.slug}`, label: `Back to ${table.title}` };
  if (!user?.accounts.includes(table.owner)) {
    return <PageHeader title="Settings" back={back} description="Only the people running this table can change it." />;
  }
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Table settings" back={back} />
      <div className="space-y-6">
        {table.managed ? (
          <Section title="Details and shape"><p className="text-sm text-muted-foreground">This table is kept in the library's files, so its details, columns and rows are changed there.</p></Section>
        ) : (
          <>
            <Section title="Details"><Details key={table.title + table.scope} table={table} onChanged={onChanged} /></Section>
            <Section title="Columns" description="Removing a column keeps its past changes in the history. A column's type can't change, because its values were checked against it."><Columns table={table} onChanged={onChanged} /></Section>
            <Section title="Rows" description="Removing a row keeps its past changes in the history. Add the same name again to bring it back."><Rows table={table} onChanged={onChanged} /></Section>
          </>
        )}
        {owner && <Section title="Who can see it"><ManageAccess table={table} onChanged={onChanged} /></Section>}
        {owner && !table.managed && <DeleteTable table={table} />}
      </div>
    </div>
  );
}
