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
      <div className="flex flex-col overflow-hidden rounded-xl border bg-background shadow-xl shadow-brand/5 ring-4 ring-brand-soft/60">
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
      <div className="relative overflow-hidden">
        <div aria-hidden="true" className="bg-ruled pointer-events-none absolute inset-0 -top-px" />
        <section className="relative mx-auto max-w-3xl px-4 pt-16 pb-14 text-center sm:px-6 sm:pt-24 sm:pb-20">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border bg-background/80 px-3 py-1 font-mono text-xs text-muted-foreground backdrop-blur">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-brand" />
            Every value says where it came from
          </p>
          <h1 className="mt-6 text-4xl font-semibold tracking-tighter text-balance sm:text-6xl">
            Tables your agent <span className="text-brand-ink">keeps for you</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-pretty text-muted-foreground">Track job applications, build a dataset, keep a reading list. Your agent fills it from your email, your files and the web, and every value records its source.</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
            <Button size="lg" asChild>
              <Link href="/new">
                Start a table
                <ArrowRight />
              </Link>
            </Button>
            <AgentButton label="Connect an agent" />
          </div>
        </section>
      </div>
      <main className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
        <section aria-labelledby="templates">
          <div className="mb-4">
            <p className="eyebrow">Templates</p>
            <h2 id="templates" className="mt-1 text-xl font-semibold tracking-tight">Start from a template</h2>
          </div>
          <TemplateCards />
        </section>
        <section className="mt-20" aria-labelledby="library">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div className="max-w-xl">
              <p className="eyebrow">The public library</p>
              <h2 id="library" className="mt-1 text-xl font-semibold tracking-tight">Sourced tables you can check yourself</h2>
              <p className="mt-1 text-sm text-muted-foreground">Every value quotes the page that states it. Select one to see its proof. Corrections go to the owner as a sourced proposal, so nothing changes silently.</p>
            </div>
            <Button variant="outline" size="sm" asChild><Link href="/explore">Browse all tables<ArrowRight /></Link></Button>
          </div>
          <Demo />
        </section>
        <section className="mt-20 grid gap-3 sm:grid-cols-3" aria-label="How it works">
          {points.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-xl border bg-card p-5">
              <span className="flex size-9 items-center justify-center rounded-lg bg-brand-soft text-brand-ink"><Icon className="size-4.5" /></span>
              <h2 className="mt-4 font-medium">{title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </section>
      </main>
    </Page>
  );
}
