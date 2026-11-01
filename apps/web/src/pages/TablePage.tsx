import { ArrowRight, ExternalLink } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { AgentButton } from "@/components/Chrome";
import { Page } from "@/components/Shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useJson, useMe } from "@/lib/api";
import { accountName, day, host } from "@/lib/cells";
import { statusCounts, statuses, type CellStatus, type PublishedTable } from "@/lib/status";
import { Message } from "@/pages/Message";
import { Grid } from "@/pages/Sheet";
import { Activity, AllChanges, AllProposals } from "@/pages/TableActivity";

const PREVIEW_ROWS = 6;

export const tableViews = ["proposals", "history"] as const;
export type TableView = (typeof tableViews)[number];

const SideSection = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="border-b pb-5 last:border-b-0">
    <h2 className="mb-2.5 text-sm font-semibold">{title}</h2>
    {children}
  </section>
);

/** How the table's cells stack up, as one bar and a key. */
function Health({ table }: { table: PublishedTable }) {
  const counts = statusCounts(table);
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  const best = ["confirmed", "summary", "once", "gone", "fracture", "gap"] satisfies CellStatus[];
  const shown = best.filter((status) => counts.has(status));
  return (
    <>
      <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" role="img" aria-label="How the table's values were checked">
        {shown.map((status) => <div key={status} className={statuses[status].solid} style={{ width: `${(counts.get(status)! / total) * 100}%` }} />)}
      </div>
      <ul className="mt-3 space-y-1.5 text-sm">
        {shown.map((status) => {
          const { label, detail, icon: Icon } = statuses[status];
          return (
            <li key={status} title={detail} className="flex items-center gap-2">
              <Icon className="size-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">{label}</span>
              <span className="ml-auto font-medium tabular-nums">{counts.get(status)}</span>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** The sites a table's values come from, most used first. */
function Sources({ table }: { table: PublishedTable }) {
  const sites = new Map<string, { url: string; cells: number }>();
  for (const row of table.rows) {
    for (const cell of Object.values(row.cells)) {
      if ("missing" in cell) continue;
      const site = host(cell.source);
      sites.set(site, { url: cell.source, cells: (sites.get(site)?.cells ?? 0) + 1 });
    }
  }
  return (
    <ul className="space-y-1.5 text-sm">
      {[...sites].sort(([, a], [, b]) => b.cells - a.cells).map(([site, { url, cells }]) => (
        <li key={site}>
          <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground">
            <span className="truncate">{site}</span>
            <ExternalLink className="size-3 shrink-0" />
            <span className="ml-auto shrink-0 text-xs tabular-nums">{cells}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/** The column beside the data, like a repository's About box. */
function About({ table }: { table: PublishedTable }) {
  const cells = table.rows.flatMap((row) => Object.values(row.cells));
  const filled = cells.filter((cell) => !("missing" in cell));
  const lastChecked = table.watch?.ran ?? filled.reduce((latest, cell) => (cell.read > latest ? cell.read : latest), "");
  const facts: [string, string | number][] = [
    ["Topic", table.topic],
    ["Rows", table.rows.length],
    ["Columns", table.columns.length],
    ["Filled", `${Math.round((filled.length / cells.length) * 100)}%`],
    ["Last checked", day(lastChecked)],
  ];
  return (
    <aside className="space-y-5">
      <SideSection title="About">
        <dl className="space-y-1.5 text-sm">
          {facts.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </SideSection>
      <SideSection title="How it's checked"><Health table={table} /></SideSection>
      <SideSection title="Sources"><Sources table={table} /></SideSection>
    </aside>
  );
}

function Overview({ table, canDecide }: { table: PublishedTable; canDecide: boolean }) {
  const [, navigate] = useLocation();
  const sheet = `/${table.owner}/${table.slug}/sheet`;
  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_15rem]">
      <div className="min-w-0 space-y-6">
        <section className="flex flex-col overflow-hidden rounded-xl border">
          <header className="flex items-center justify-between gap-3 border-b bg-muted px-3 py-2 text-sm">
            <span className="text-muted-foreground">Showing {Math.min(PREVIEW_ROWS, table.rows.length)} of {table.rows.length} rows</span>
            <Link href={sheet} className="flex items-center gap-1 font-medium hover:underline">
              Open full sheet
              <ArrowRight className="size-3.5" />
            </Link>
          </header>
          <Grid table={{ ...table, rows: table.rows.slice(0, PREVIEW_ROWS) }} selectedId={null} select={(id) => id && navigate(`${sheet}?cell=${id}`)} emptyRows={0} />
        </section>
        <Activity table={table} canDecide={canDecide} />
        <section className="overflow-hidden rounded-xl border">
          <h2 className="border-b bg-muted px-3 py-2 text-sm font-medium">About this data</h2>
          <div className="space-y-5 p-4">
            <p className="text-sm leading-relaxed">{table.scope}</p>
            <div>
              <h3 className="mb-2 text-sm font-semibold">Columns</h3>
              <dl className="divide-y text-sm">
                {table.columns.map((column) => (
                  <div key={column.id} className="grid gap-x-4 gap-y-0.5 py-2 sm:grid-cols-[10rem_1fr]">
                    <dt className="font-medium">{column.label}{column.unit ? <span className="font-normal text-muted-foreground"> ({column.unit})</span> : null}</dt>
                    <dd className="text-muted-foreground">{column.rule}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>
      </div>
      <About table={table} />
    </div>
  );
}

function TableDetails({ table, view }: { table: PublishedTable; view?: TableView }) {
  const { user } = useMe();
  const canManage = !!user?.accounts.includes(table.owner);

  useEffect(() => {
    document.title = `${table.title} · Skeletable`;
  }, [table.title]);

  if (view === "proposals") return <AllProposals table={table} canDecide={canManage} />;
  if (view === "history") return <AllChanges table={table} />;

  return (
    <>
      <section className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-96">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h1 className="text-xl tracking-tight sm:text-2xl">
              <Link href={`/${table.owner}`} className="text-muted-foreground hover:text-foreground hover:underline">{accountName(table.owner)}</Link>
              <span className="mx-1.5 text-muted-foreground">/</span>
              <span className="font-semibold">{table.title}</span>
            </h1>
            <Badge variant="outline">Public</Badge>
          </div>
          <p className="mt-1.5 max-w-2xl text-muted-foreground">{table.question}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <AgentButton label="Connect an agent" />
          <Button size="lg" asChild>
            <Link href={`/${table.owner}/${table.slug}/sheet`}>
              Open sheet
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>
      <div className="mt-6"><Overview table={table} canDecide={canManage} /></div>
    </>
  );
}

/** A table's own page: what it is and how far to trust it, with the sheet one click away. */
export function TablePage({ owner, slug, view }: { owner: string; slug: string; view?: TableView }) {
  const { data, status, retry } = useJson<PublishedTable>(`/api/tables/${owner}/${slug}`);
  return (
    <Page>
      <main className="mx-auto max-w-5xl px-4 pt-6 pb-16 sm:px-6">
        {status === "missing" ? (
          <Message title="There's no table here" />
        ) : status === "failed" ? (
          <Message title="This table didn't load" action={<Button variant="outline" size="sm" onClick={retry}>Try again</Button>} />
        ) : data ? (
          <TableDetails table={data} view={view} />
        ) : (
          <div className="space-y-4" aria-label="Loading table">
            <Skeleton className="h-9 w-2/3" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-72 rounded-xl" />
          </div>
        )}
      </main>
    </Page>
  );
}
