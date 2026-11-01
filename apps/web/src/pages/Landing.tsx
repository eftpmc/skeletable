import { ArrowRight, Bot, Quote, SearchX } from "lucide-react";
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
  { icon: Quote, title: "Proof in every cell", body: "Select a value to read the exact words that state it, and open the source." },
  { icon: SearchX, title: "Honest gaps", body: "When no source states a value, the cell says so and shows where we looked." },
  { icon: Bot, title: "Ready for agents", body: "Connect any agent over MCP, so it answers from sourced facts." },
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
        Guides say New Jersey gives businesses 30 days to report a breach. <Link href="/blog/new-jersey-30-day-deadline" className="text-foreground underline underline-offset-2">Its law gives no number.</Link>
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
          <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">Every value shows its source</h1>
          <p className="mt-4 text-lg text-muted-foreground">A public library of tables, where each cell links to the exact words that prove it.</p>
          <div className="mt-7 flex items-center justify-center gap-2">
            <Button size="lg" asChild>
              <Link href="/explore">
                Browse tables
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
