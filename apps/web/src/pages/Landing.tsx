import { ArrowRight, Bot, GitPullRequestArrow, Quote } from "lucide-react";
import { TemplateCards } from "@/components/Templates";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { AgentButton } from "@/components/Chrome";
import { Page } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useJson } from "@/lib/api";
import { cellId } from "@/lib/cells";
import { statuses, type CellStatus, type PublishedTable } from "@/lib/status";
import { FormulaBar, Grid, selectedCell } from "@/pages/Sheet";

const demoTable = "skeletable/data-breach-laws";
const demoRows = ["California", "Colorado", "Florida", "New Jersey", "New York", "Texas", "Washington"];
const demoColumns = ["statute", "notify_days", "notify_standard", "ag_notice"];
const demoKey = ["confirmed", "once", "none", "gap"] satisfies CellStatus[];

const points = [
  { icon: Quote, title: "Every value knows where it came from", body: "A person, a file, an email, a model or a page. Tables that need it go further: each value quotes its source, with checks." },
  { icon: GitPullRequestArrow, title: "Changes stay reviewable", body: "Send related corrections together with their proof. Owners accept them together, and every edit stays in history." },
  { icon: Bot, title: "Your agent does the filling", body: "Trackers, datasets and lists: your own agent adds rows, fills AI columns and keeps them current over MCP." },
];

/** A real table to try on the page: select a cell and its proof opens. */
function Demo() {
  const { data, status } = useJson<PublishedTable>(`/api/tables/${demoTable}`);
  const [selectedId, setSelectedId] = useState<string | null>(cellId("New Jersey", "notify_days"));
  if (status === "failed") return null;
  if (!data) return <Skeleton className="h-96 rounded-xl" />;
  const shown = { ...data, columns: data.columns.filter((column) => demoColumns.includes(column.id)), rows: data.rows.filter((row) => demoRows.includes(row.key)) };
  return (
    <>
      <p className="mb-3 text-center text-sm text-muted-foreground">
        Select a value to inspect its proof. If it needs changing, send a sourced proposal for the owner to review—nothing changes silently.
      </p>
      <div className="flex flex-col overflow-hidden rounded-xl border bg-background shadow-lg">
        <FormulaBar selected={selectedCell(shown, selectedId)} />
        <Grid table={shown} selectedId={selectedId} select={setSelectedId} emptyRows={0} focusOnLoad={false} />
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t bg-muted px-3 py-2 text-xs text-muted-foreground" aria-label="What the corner of a cell means">
          {demoKey.map((name) => (
            <li key={name} className="flex items-center gap-1.5">
              {statuses[name].corner ? <span aria-hidden="true" className={`size-0 border-t-[7px] border-l-[7px] border-l-transparent ${statuses[name].corner}`} /> : <span aria-hidden="true" className="size-[7px]" />}
              {statuses[name].label}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

export function Landing() {
  useEffect(() => {
    document.title = "Skeletable";
  }, []);
  return (
    <Page>
      <main className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
        <section className="mx-auto max-w-2xl pt-14 pb-10 text-center sm:pt-20">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">Tables your agent keeps for you</h1>
          <p className="mt-4 text-lg text-muted-foreground">Track job applications, build a dataset, keep a reading list. Your agent fills it from your email, your files and the web, and every value records where it came from.</p>
          <div className="mt-7 flex items-center justify-center gap-2">
            <Button size="lg" asChild>
              <Link href="/new">
                Start a table
                <ArrowRight />
              </Link>
            </Button>
            <AgentButton label="Connect an agent" />
          </div>
        </section>
        <section aria-labelledby="templates">
          <h2 id="templates" className="mb-3 text-sm font-medium text-muted-foreground">Start from a template</h2>
          <TemplateCards />
        </section>
        <section className="mt-16" aria-labelledby="library">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="library" className="font-medium">The public library</h2>
              <p className="text-sm text-muted-foreground">Sourced tables, where every value quotes the page that states it. Select a value to see its proof.</p>
            </div>
            <Button variant="ghost" size="sm" asChild><Link href="/explore">Browse all<ArrowRight /></Link></Button>
          </div>
          <Demo />
        </section>
        <section className="mt-14 grid gap-6 sm:grid-cols-3">
          {points.map(({ icon: Icon, title, body }) => (
            <div key={title}>
              <Icon className="size-5 text-green-600" />
              <h2 className="mt-2 font-medium">{title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </section>
      </main>
    </Page>
  );
}
