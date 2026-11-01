import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { Page } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { postJson, useMe } from "@/lib/api";
import { Message } from "@/pages/Message";

type NewColumn = { label: string; type: "text" | "number" | "boolean"; unit: string; rule: string };

const blankColumn = (): NewColumn => ({ label: "", type: "text", unit: "", rule: "" });

const labelClass = "block text-sm font-medium";

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
        <main className="px-4"><Message title="Sign in to create a table" action={<Button variant="outline" size="sm" asChild><a href="/auth/google">Sign in</a></Button>} /></main>
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
      <main className="mx-auto max-w-2xl px-4 pt-8 pb-16 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">New table</h1>
        <p className="mt-1 mb-6 text-muted-foreground">Set up its shape here. You'll add each value with its source in the sheet.</p>
        <form onSubmit={submit} className="space-y-6">
          <div className="space-y-4">
            {user.teams.length > 0 && (
              <label className={labelClass}>
                Owner
                <select value={owner} onChange={(event) => setOwner(event.target.value)} className="mt-1.5 h-8 w-full rounded-lg border bg-transparent px-2 text-sm font-normal dark:bg-input/30">
                  {user.handle && <option value={user.handle}>{user.name ?? user.handle}</option>}
                  {user.teams.map((team) => <option key={team.handle} value={team.handle}>{team.name}</option>)}
                </select>
              </label>
            )}
            <label className={labelClass}>Title<Input className="mt-1.5 font-normal" required maxLength={120} placeholder="Mechanical keyboards" {...detail("title")} /></label>
            <label className={labelClass}>Question it answers<Input className="mt-1.5 font-normal" required maxLength={300} placeholder="How do these keyboards compare on weight and switches?" {...detail("question")} /></label>
            <label className={labelClass}>Topic<Input className="mt-1.5 font-normal" required maxLength={40} placeholder="Consumer tech" {...detail("topic")} /></label>
            <label className={labelClass}>What it covers<Input className="mt-1.5 font-normal" required maxLength={800} placeholder="Which things belong in this table, and which don't" {...detail("scope")} /></label>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Columns</legend>
            {columns.map((column, index) => (
              <div key={index} className="space-y-2 rounded-xl border p-3">
                <div className="flex gap-2">
                  <Input aria-label={`Column ${index + 1} name`} required maxLength={80} placeholder="Name, like Weight" value={column.label} onChange={(event) => setColumn(index, { label: event.target.value })} />
                  <select
                    aria-label={`Column ${index + 1} type`}
                    value={column.type}
                    onChange={(event) => setColumn(index, { type: event.target.value as NewColumn["type"] })}
                    className="h-8 rounded-lg border bg-transparent px-2 text-sm dark:bg-input/30"
                  >
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="boolean">Yes or no</option>
                  </select>
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

          <label className={labelClass}>
            Rows, one per line
            <textarea
              required
              rows={5}
              value={rows}
              onChange={(event) => setRows(event.target.value)}
              placeholder={"Keychron Q1\nNuPhy Air75"}
              className="mt-1.5 w-full rounded-lg border bg-transparent px-2.5 py-1.5 text-sm font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            />
          </label>

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

          <div className="flex items-center gap-3">
            <Button type="submit" size="lg" disabled={sending}>{sending ? "Creating..." : "Create table"}</Button>
            {error && <span role="alert" className="text-sm text-destructive">{error}</span>}
          </div>
        </form>
      </main>
    </Page>
  );
}
