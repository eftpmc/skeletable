import type { Table } from "@skeleton/tables/format";
import { ArrowRight, Bot, Quote, SearchX } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { AccountButton, AgentButton, Logo, ThemeButton } from "@/components/Chrome";
import { PhoneMenu } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useJson } from "@/lib/api";
import { cellId } from "@/lib/cells";
import { FormulaBar, Grid } from "@/pages/Sheet";

const demoTable = "skeletable/handheld-gaming-pcs";

const points = [
  { icon: Quote, title: "Proof in every cell", body: "Select a value to read the exact words that state it, and open the source." },
  { icon: SearchX, title: "Honest gaps", body: "When no source states a value, the cell says so and shows where we looked." },
  { icon: Bot, title: "Ready for agents", body: "Connect any agent over MCP, so it answers from sourced facts." },
];

/** A real table to try on the page: select a cell and its proof opens. */
function Demo() {
  const { data, status } = useJson<Table>(`/api/tables/${demoTable}`);
  const [selectedId, setSelectedId] = useState<string | null>(cellId("Steam Deck OLED", "battery_wh"));
  if (status === "failed") return null;
  if (!data) return <Skeleton className="h-96 rounded-xl" />;
  const row = data.rows.find((r) => selectedId?.startsWith(cellId(r.key, "")));
  const column = data.columns.find((c) => row && cellId(row.key, c.id) === selectedId);
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border bg-background shadow-lg">
      <FormulaBar selected={row && column ? { rowKey: row.key, column, cell: row.cells[column.id]! } : undefined} />
      <Grid table={data} selectedId={selectedId} select={setSelectedId} emptyRows={0} focusOnLoad={false} />
    </div>
  );
}

export function Landing() {
  useEffect(() => {
    document.title = "Skeletable";
  }, []);
  return (
    <div className="min-h-svh">
      <header className="flex items-center gap-4 border-b px-4 py-2.5">
        <Link href="/" className="flex items-center gap-2 font-medium tracking-tight">
          <Logo className="size-7" />
          Skeletable
        </Link>
        <Link href="/explore" className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground md:inline">Browse tables</Link>
        <div className="ml-auto hidden items-center gap-1 md:flex">
          <AgentButton />
          <ThemeButton />
          <AccountButton />
        </div>
        <div className="ml-auto md:hidden"><PhoneMenu /></div>
      </header>
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
    </div>
  );
}
