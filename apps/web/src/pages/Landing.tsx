import { ArrowRight, Bot, GitPullRequestArrow, Quote } from "lucide-react";
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
  { icon: Quote, title: "Proof, not just answers", body: "Open any value to see its exact quote, source, checks, and what the source did not state." },
  { icon: GitPullRequestArrow, title: "Changes stay reviewable", body: "Send related corrections together with their proof. Owners accept them together, and every edit stays in history." },
  { icon: Bot, title: "People and agents use the same facts", body: "Read public tables over MCP, or let your own agent build and check a private draft." },
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
          <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">Facts you can trace and improve</h1>
          <p className="mt-4 text-lg text-muted-foreground">Source-backed tables for people and agents. Every value has proof, a review path, and a history.</p>
          <div className="mt-7 flex items-center justify-center gap-2">
            <Button size="lg" asChild>
              <Link href="/explore">
                Browse public tables
                <ArrowRight />
              </Link>
            </Button>
            <AgentButton label="Connect an agent" />
          </div>
        </section>
        <Demo />
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
