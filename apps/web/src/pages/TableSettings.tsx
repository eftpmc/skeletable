import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { ConfirmButton, Field, FormError, PageHeader, Section } from "@/components/Layout";
import { ManageAccess } from "@/components/Share";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ownsAccount } from "@/lib/account";
import { sendJson, useMe } from "@/lib/api";
import type { PublishedTable } from "@/lib/status";

type Props = { table: PublishedTable; onChanged: () => void };

const useSave = (table: PublishedTable) => {
  const [error, setError] = useState<string>();
  const save = async (method: string, path: string, body: unknown, done: string) => {
    const { ok, data } = await sendJson<{ error?: string; slug?: string }>(method, `/api/tables/${table.owner}/${table.slug}${path}`, body);
    if (!ok) return setError(data.error ?? "That didn't save.");
    setError(undefined);
    toast.success(done);
    return data;
  };
  return { error, save };
};

function Details({ table, onChanged }: Props) {
  const [, navigate] = useLocation();
  const [form, setForm] = useState({ title: table.title, question: table.question, topic: table.topic, scope: table.scope });
  const { error, save } = useSave(table);
  const field = (name: keyof typeof form) => ({ value: form[name], onChange: (event: { target: { value: string } }) => setForm({ ...form, [name]: event.target.value }) });
  return (
    <form onSubmit={async (event: FormEvent) => {
      event.preventDefault();
      const saved = await save("PATCH", "", form, "Details saved");
      // A draft's address follows its title.
      if (saved?.slug && saved.slug !== table.slug) navigate(`/${table.owner}/${saved.slug}/settings`, { replace: true });
      else if (saved) onChanged();
    }} className="space-y-4">
      <Field label="Title" hint={table.draft ? undefined : "The table's address stays the same, so links keep working."}><Input required maxLength={120} {...field("title")} /></Field>
      <Field label="Question it answers"><Input required={!table.draft} maxLength={300} {...field("question")} /></Field>
      <Field label="Topic"><Input required={!table.draft} maxLength={40} {...field("topic")} /></Field>
      <Field label="What it covers"><Textarea required={!table.draft} rows={3} maxLength={800} {...field("scope")} /></Field>
      <FormError error={error} />
      <Button type="submit" variant="outline">Save</Button>
    </form>
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
  if (!user?.accounts.includes(table.owner)) {
    return <PageHeader title="Table settings" description="Only the people running this table can change it." />;
  }
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Table settings" />
      <div className="space-y-6">
        {table.managed ? (
          <Section title="Details and shape"><p className="text-sm text-muted-foreground">This table is kept in the library's files, so its details, columns and rows are changed there.</p></Section>
        ) : (
          <>
            <Section title="Details" description="Columns and rows are edited in the sheet."><Details key={table.title + table.scope} table={table} onChanged={onChanged} /></Section>
          </>
        )}
        {owner && <Section title="Who can see it"><ManageAccess table={table} onChanged={onChanged} /></Section>}
        {owner && !table.managed && <DeleteTable table={table} />}
      </div>
    </div>
  );
}
