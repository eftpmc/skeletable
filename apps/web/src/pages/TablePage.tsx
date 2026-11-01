import { ArrowRight, ExternalLink } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { AgentButton } from "@/components/Chrome";
import { Page } from "@/components/Shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useJson } from "@/lib/api";
import { accountName, day, host } from "@/lib/cells";
import { statusCounts, statuses, type CellStatus, type PublishedTable } from "@/lib/status";
import { Message } from "@/pages/Message";
import { Grid } from "@/pages/Sheet";

const PREVIEW_ROWS = 5;

const Stat = ({ label, value }: { label: string; value: string | number }) => (
  <div>
    <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
    <p className="text-xs text-muted-foreground">{label}</p>
  </div>
);

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section>
    <h2 className="mb-3 font-medium">{title}</h2>
    {children}
  </section>
);

/** How the table's cells stack up, as one bar and a key. */
function Health({ table }: { table: PublishedTable }) {
  const counts = statusCounts(table);
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  const shown = (Object.keys(statuses) as CellStatus[]).filter((status) => counts.has(status)).reverse();
  return (
    <>
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label="How the table's values were checked">
        {shown.map((status) => <div key={status} className={statuses[status].solid} style={{ width: `${(counts.get(status)! / total) * 100}%` }} />)}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {shown.map((status) => {
          const { label, detail, icon: Icon } = statuses[status];
          return (
            <li key={status} title={detail} className="flex items-center gap-1.5">
              <Icon className="size-3.5 text-muted-foreground" />
              <span className="font-medium tabular-nums">{counts.get(status)}</span>
              <span className="text-muted-foreground">{label}</span>
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
    <ul className="divide-y rounded-xl border text-sm">
      {[...sites].sort(([, a], [, b]) => b.cells - a.cells).map(([site, { url, cells }]) => (
        <li key={site}>
          <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-3 px-3 py-2 transition-colors hover:bg-muted/50">
            <span className="flex min-w-0 items-center gap-1.5"><span className="truncate">{site}</span><ExternalLink className="size-3 shrink-0 text-muted-foreground" /></span>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{cells} {cells === 1 ? "value" : "values"}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function TableDetails({ table }: { table: PublishedTable }) {
  const [, navigate] = useLocation();
  const sheet = `/${table.owner}/${table.slug}/sheet`;
  const cells = table.rows.flatMap((row) => Object.values(row.cells));
  const filled = cells.filter((cell) => !("missing" in cell));
  const lastChecked = table.watch?.ran ?? filled.reduce((latest, cell) => (cell.read > latest ? cell.read : latest), "");

  useEffect(() => {
    document.title = `${table.title} · Skeletable`;
  }, [table.title]);

  return (
    <div className="space-y-8">
      <section>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Link href={`/${table.owner}`} className="hover:text-foreground hover:underline">{accountName(table.owner)}</Link>
          <span>/</span>
          <Badge variant="secondary">{table.topic}</Badge>
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{table.title}</h1>
        <p className="mt-2 max-w-2xl text-lg text-muted-foreground">{table.question}</p>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button size="lg" asChild>
            <Link href={sheet}>
              Open sheet
              <ArrowRight />
            </Link>
          </Button>
          <AgentButton label="Connect an agent" />
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 border-y py-4 sm:grid-cols-4">
        <Stat label="Rows" value={table.rows.length} />
        <Stat label="Columns" value={table.columns.length} />
        <Stat label="Filled" value={`${Math.round((filled.length / cells.length) * 100)}%`} />
        <Stat label="Last checked" value={day(lastChecked)} />
      </section>

      <Section title="Preview">
        <div className="flex flex-col overflow-hidden rounded-xl border">
          <Grid
            table={{ ...table, rows: table.rows.slice(0, PREVIEW_ROWS) }}
            selectedId={null}
            select={(id) => id && navigate(`${sheet}?cell=${id}`)}
            emptyRows={0}
          />
        </div>
      </Section>

      <Section title="How it's checked"><Health table={table} /></Section>

      <div className="grid gap-8 md:grid-cols-2">
        <Section title="What's in it">
          <ul className="divide-y rounded-xl border text-sm">
            {table.columns.map((column) => (
              <li key={column.id} className="px-3 py-2">
                <p className="font-medium">{column.label}{column.unit ? ` (${column.unit})` : ""}</p>
                <p className="text-muted-foreground">{column.rule}</p>
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Sources"><Sources table={table} /></Section>
      </div>

      <Section title="What it covers"><p className="max-w-2xl text-sm text-muted-foreground">{table.scope}</p></Section>
    </div>
  );
}

/** A table's own page: what it is and how far to trust it, with the sheet one click away. */
export function TablePage({ owner, slug }: { owner: string; slug: string }) {
  const { data, status, retry } = useJson<PublishedTable>(`/api/tables/${owner}/${slug}`);
  return (
    <Page>
      <main className="mx-auto max-w-4xl px-4 pt-8 pb-16 sm:px-6">
        {status === "missing" ? (
          <Message title="There's no table here" />
        ) : status === "failed" ? (
          <Message title="This table didn't load" action={<Button variant="outline" size="sm" onClick={retry}>Try again</Button>} />
        ) : data ? (
          <TableDetails table={data} />
        ) : (
          <div className="space-y-4" aria-label="Loading table">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-6 w-full max-w-lg" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        )}
      </main>
    </Page>
  );
}
