import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { Content, Field, FormError, PageHeader, SignInLink } from "@/components/Layout";
import { Page } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { postJson, useMe } from "@/lib/api";
import { Message } from "@/pages/Message";

type NewColumn = { label: string; type: "text" | "number" | "boolean"; unit: string; rule: string };

const blankColumn = (): NewColumn => ({ label: "", type: "text", unit: "", rule: "" });

/** Start a table: what it answers, what it measures, and what it covers. Values and their proof come next, in the sheet. */
export function NewTable() {
  const { user } = useMe();
  const [, navigate] = useLocation();
  const [details, setDetails] = useState({ title: "", question: "", topic: "", scope: "" });
  const [owner, setOwner] = useState(user?.handle ?? "");
  const [isPrivate, setIsPrivate] = useState(false);
  const [columns, setColumns] = useState<NewColumn[]>([blankColumn()]);
  const [rows, setRows] = useState("");
  const [error, setError] = useState<string>();
  const [sending, setSending] = useState(false);

  useEffect(() => {
    document.title = "New table · Skeletable";
  }, []);

  if (!user) {
    return (
      <Page>
        <Content size="narrow"><Message title="Sign in to create a table" action={<SignInLink />} /></Content>
      </Page>
    );
  }

  const detail = (name: keyof typeof details) => ({ value: details[name], onChange: (event: { target: { value: string } }) => setDetails({ ...details, [name]: event.target.value }) });
  const setColumn = (index: number, change: Partial<NewColumn>) => setColumns(columns.map((column, at) => (at === index ? { ...column, ...change } : column)));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSending(true);
    setError(undefined);
    const { ok, data } = await postJson<{ owner: string; slug: string; error?: string }>("/api/tables", {
      ...details,
      ...(owner && { owner }),
      private: isPrivate,
      columns: columns.map(({ unit, ...column }) => ({ ...column, ...(unit.trim() && { unit }) })),
      rows: rows.split("\n").map((row) => row.trim()).filter(Boolean),
    });
    setSending(false);
    if (ok) navigate(`/${data.owner}/${data.slug}/sheet`);
    else setError(data.error ?? "That didn't save. Try again.");
  };

  return (
    <Page>
      <Content size="narrow">
        <PageHeader title="New table" description="Set up its shape here. You'll add each value with its source in the sheet." />
        <form onSubmit={submit} className="space-y-6">
          <div className="space-y-4">
            {user.teams.length > 0 && (
              <Field label="Owner">
                <NativeSelect value={owner} onChange={(event) => setOwner(event.target.value)} className="w-full">
                  {user.handle && <option value={user.handle}>{user.name ?? user.handle}</option>}
                  {user.teams.map((team) => <option key={team.handle} value={team.handle}>{team.name}</option>)}
                </NativeSelect>
              </Field>
            )}
            <Field label="Title"><Input required maxLength={120} placeholder="Mechanical keyboards" {...detail("title")} /></Field>
            <Field label="Question it answers"><Input required maxLength={300} placeholder="How do these keyboards compare on weight and switches?" {...detail("question")} /></Field>
            <Field label="Topic"><Input required maxLength={40} placeholder="Consumer tech" {...detail("topic")} /></Field>
            <Field label="What it covers"><Textarea required rows={2} maxLength={800} placeholder="Which things belong in this table, and which don't" {...detail("scope")} /></Field>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Columns</legend>
            {columns.map((column, index) => (
              <div key={index} className="space-y-2 rounded-xl border p-3">
                <div className="flex gap-2">
                  <Input aria-label={`Column ${index + 1} name`} required maxLength={80} placeholder="Name, like Weight" value={column.label} onChange={(event) => setColumn(index, { label: event.target.value })} />
                  <NativeSelect aria-label={`Column ${index + 1} type`} value={column.type} onChange={(event) => setColumn(index, { type: event.target.value as NewColumn["type"] })}>
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="boolean">Yes or no</option>
                  </NativeSelect>
                  {columns.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => setColumns(columns.filter((_, at) => at !== index))} aria-label={`Remove column ${index + 1}`}><Trash2 /></Button>
                  )}
                </div>
                <div className="flex gap-2">
                  {column.type === "number" && <Input aria-label={`Column ${index + 1} unit`} className="w-24" maxLength={30} placeholder="Unit" value={column.unit} onChange={(event) => setColumn(index, { unit: event.target.value })} />}
                  <Input aria-label={`Column ${index + 1} rule`} required maxLength={500} placeholder="What counts, like Weight as the maker states it" value={column.rule} onChange={(event) => setColumn(index, { rule: event.target.value })} />
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setColumns([...columns, blankColumn()])} disabled={columns.length >= 20}><Plus />Add column</Button>
          </fieldset>

          <Field label="Rows, one per line">
            <Textarea required rows={5} value={rows} onChange={(event) => setRows(event.target.value)} placeholder={"Keychron Q1\nNuPhy Air75"} />
          </Field>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Who can see it</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="visibility" className="size-4 accent-green-600" checked={!isPrivate} onChange={() => setIsPrivate(false)} />
              Public: anyone, and it shows up in Browse
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="visibility" className="size-4 accent-green-600" checked={isPrivate} onChange={() => setIsPrivate(true)} />
              Private: only this account and people you add
            </label>
          </fieldset>

          <FormError error={error} />
          <Button type="submit" size="lg" disabled={sending}>{sending ? "Creating..." : "Create table"}</Button>
        </form>
      </Content>
    </Page>
  );
}
