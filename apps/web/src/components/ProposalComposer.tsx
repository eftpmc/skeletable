import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { Field } from "@/components/Layout";
import { Spinner } from "@/components/Loading";
import { postJson, useMe } from "@/lib/api";
import { signInHref } from "@/lib/account";
import { display } from "@/lib/cells";
import type { PublishedTable } from "@/lib/status";

export function ProposalComposer({ table, onCreated }: { table: PublishedTable; onCreated: () => void }) {
  const { user, canSignIn } = useMe();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const blank = () => ({ row: table.rows[0]?.key ?? "", column: table.columns[0]?.id ?? "", value: "", source: "", quote: "" });
  const [changes, setChanges] = useState([blank()]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setPending(true); setError("");
    try {
      const result = await postJson<{ error?: string }>(`/api/tables/${table.owner}/${table.slug}/proposal-bundles`, { title, note, changes });
      if (!result.ok) { setError(result.data.error ?? "Could not submit. Try again."); return; }
      setOpen(false); setTitle(""); setNote(""); setChanges([blank()]); onCreated();
    } catch { setError("Could not connect. Your proposal is still here; try again."); }
    finally { setPending(false); }
  };
  if (!user) return <p className="mb-5 text-sm text-muted-foreground">{canSignIn ? <a className="underline" href={signInHref()}>Sign in to propose changes</a> : "Proposals require sign-in and database-backed storage."}</p>;
  if (!open) return <Button className="mb-5" disabled={!table.rows.length || !table.columns.length} onClick={() => setOpen(true)}>New proposal</Button>;
  return <form onSubmit={submit} className="mb-6 space-y-4 rounded-xl border p-4">
    <fieldset disabled={pending} className="space-y-4">
      <Field label="Proposal title"><Input required maxLength={160} placeholder="Update handheld specifications" value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
      <Field label="Why this change?"><Textarea maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} /></Field>
      {changes.map((change, index) => {
        const field = (key: keyof typeof change) => ({ value: change[key], onChange: (event: { target: { value: string } }) => setChanges((items) => items.map((item, at) => at === index ? { ...item, [key]: event.target.value } : item)) });
        const current = table.rows.find((row) => row.key === change.row)?.cells[change.column];
        return <section key={index} className="space-y-3 border-t pt-4">
          <div className="flex items-center justify-between"><h3 className="text-sm font-medium">Change {index + 1}</h3>{changes.length > 1 && <Button type="button" size="sm" variant="ghost" onClick={() => setChanges((items) => items.filter((_, at) => at !== index))}>Remove</Button>}</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Row"><NativeSelect {...field("row")}>{table.rows.map((row) => <option key={row.key} value={row.key}>{row.key}</option>)}</NativeSelect></Field>
            <Field label="Column"><NativeSelect {...field("column")}>{table.columns.map((column) => <option key={column.id} value={column.id}>{column.label}</option>)}</NativeSelect></Field>
          </div>
          <p className="text-xs text-muted-foreground">Current: {current && "value" in current ? display(current.value) : "No stated value"}</p>
          <Field label="Proposed value"><Input required maxLength={300} {...field("value")} /></Field>
          <Field label="Source URL"><Input required type="url" maxLength={2000} {...field("source")} /></Field>
          <Field label="Exact quote"><Textarea required maxLength={400} {...field("quote")} /></Field>
        </section>;
      })}
      <Button type="button" variant="outline" disabled={changes.length >= 20} onClick={() => setChanges((items) => [...items, blank()])}>Add another change</Button>
    </fieldset>
    <p className="text-xs text-muted-foreground">Every source is checked before submission. All changes stay pending until accepted together.</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="flex gap-2"><Button disabled={pending} type="submit">{pending && <Spinner label="Checking proposal sources" />}{pending ? "Checking sources..." : "Submit for review"}</Button><Button disabled={pending} type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button></div>
  </form>;
}
