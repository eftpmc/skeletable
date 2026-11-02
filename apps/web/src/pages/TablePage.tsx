import { aiProgress, columnSummary } from "@skeleton/tables/columns";
import { hasValue, isAnswered, proofOptional } from "@skeleton/tables/format";
import { ArrowRight, ExternalLink, Settings2, Sparkles } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { AgentBuildButton } from "@/components/AgentBuild";
import { ColumnSummaryView, ForkButton, ForkedFrom, SaveVersionDialog, VersionList } from "@/components/Data";
import { DownloadButton } from "@/components/Download";
import { Content, LoadFailed } from "@/components/Layout";
import { NoTable } from "@/components/NoTable";
import { PublishDraft } from "@/components/Publish";
import { ShareButton } from "@/components/Share";
import { Page } from "@/components/Shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useJson, useMe } from "@/lib/api";
import { accountName, day, host, ownerLabel, rowPath } from "@/lib/cells";
import { statusCounts, statuses, type CellStatus, type PublishedTable } from "@/lib/status";
import { FormulaBar, Grid, selectedCell } from "@/pages/Sheet";
import { Activity, AllChanges, AllProposals } from "@/pages/TableActivity";
import { TableSettings } from "@/pages/TableSettings";
import type { TableView } from "@/lib/views";

const PREVIEW_ROWS = 8;


const viewLabels: Record<TableView, string> = { proposals: "Proposals", history: "History", settings: "Settings" };

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
  const best = ["confirmed", "summary", "none", "once", "gone", "fracture", "linked", "imported", "entered", "generated", "unproven", "gap", "blank"] satisfies CellStatus[];
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
      if (!("source" in cell) || !cell.source) continue;
      const site = host(cell.source);
      sites.set(site, { url: cell.source, cells: (sites.get(site)?.cells ?? 0) + 1 });
    }
  }
  if (!sites.size) return <p className="text-sm text-muted-foreground">No sources yet.</p>;
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
function About({ table, canManage, onChanged }: { table: PublishedTable; canManage: boolean; onChanged: () => void }) {
  const [saving, setSaving] = useState(false);
  const cells = table.rows.flatMap((row) => Object.values(row.cells));
  const filled = cells.filter(hasValue);
  const answered = cells.length ? Math.round((cells.filter(isAnswered).length / cells.length) * 100) : 0;
  const lastChecked = table.watch?.ran ?? filled.reduce((latest, cell) => (cell.read > latest ? cell.read : latest), "");
  const facts: [string, string | number][] = [
    ["Topic", table.topic],
    ["Rows", table.rows.length],
    ["Columns", table.columns.length],
    ["Filled", `${answered}%`],
    ["Last checked", lastChecked ? day(lastChecked) : "Not yet"],
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
      <SideSection title={proofOptional(table) ? "Where values came from" : "How it's checked"}><Health table={table} /></SideSection>
      <SideSection title="Versions">
        <VersionList table={table} />
        {canManage && <Button variant="outline" size="sm" className="mt-3" onClick={() => setSaving(true)}>Save a version</Button>}
        {saving && <SaveVersionDialog table={table} onClose={() => setSaving(false)} onSaved={onChanged} />}
      </SideSection>
      <SideSection title="Sources"><Sources table={table} /></SideSection>
    </aside>
  );
}

function Overview({ table, canDecide, onChanged }: { table: PublishedTable; canDecide: boolean; onChanged: () => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const sheet = `/${table.owner}/${table.slug}/sheet`;
  return (
    <div className="space-y-8">
      <section className="flex flex-col overflow-hidden rounded-xl border shadow-sm">
        {selectedId && <FormulaBar table={table} onChanged={onChanged} selected={selectedCell(table, selectedId)} />}
        <Grid table={{ ...table, rows: table.rows.slice(0, PREVIEW_ROWS) }} selectedId={selectedId} select={setSelectedId} emptyRows={0} focusOnLoad={false} rowHref={(key) => rowPath(table, key)} />
        <Link href={selectedId ? `${sheet}?cell=${selectedId}` : sheet} className="flex items-center justify-between gap-3 bg-muted px-3 py-2 text-sm transition-colors hover:bg-accent">
          <span className="min-w-0 truncate text-muted-foreground">{table.rows.length > PREVIEW_ROWS ? `Showing ${PREVIEW_ROWS} of ${table.rows.length} rows. Select any value to see its proof` : "Select any value to see its proof"}</span>
          <span className="flex shrink-0 items-center gap-1 font-medium">Open full sheet<ArrowRight className="size-3.5" /></span>
        </Link>
      </section>
      <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="min-w-0 space-y-6">
          {table.draft && canDecide && <PublishDraft table={table} onChanged={onChanged} />}
          <Activity table={table} canDecide={canDecide} />
        <section className="overflow-hidden rounded-xl border">
          <h2 className="border-b bg-muted px-3 py-2 text-sm font-medium">About this data</h2>
          <div className="space-y-5 p-4">
            <p className="text-sm leading-relaxed">{table.scope}</p>
            <div>
              <h3 className="mb-2 text-sm font-semibold">Columns</h3>
              <dl className="divide-y text-sm">
                {table.columns.map((column) => {
                  const progress = column.instruction ? aiProgress(table, column) : undefined;
                  return (
                    <div key={column.id} className="grid gap-x-4 gap-y-1 py-2.5 sm:grid-cols-[10rem_1fr_12rem]">
                      <dt className="font-medium">{column.label}{column.unit ? <span className="font-normal text-muted-foreground"> ({column.unit})</span> : null}</dt>
                      <dd className="min-w-0 space-y-1 text-muted-foreground">
                        {column.rule && <p>{column.rule}</p>}
                        {column.instruction && (
                          <p className="flex gap-1.5 text-xs"><Sparkles className="mt-0.5 size-3 shrink-0 text-indigo-500" /><span><span className="font-medium text-foreground">AI column:</span> {column.instruction}{column.choices ? ` (${column.choices.join(", ")})` : ""}{progress && progress.pending + progress.stale ? ` · ${progress.pending + progress.stale} waiting for your agent` : ""}</span></p>
                        )}
                      </dd>
                      <dd className="min-w-0"><ColumnSummaryView summary={columnSummary(table, column)} column={column} compact /></dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          </div>
        </section>
        </div>
        <About table={table} canManage={canDecide} onChanged={onChanged} />
      </div>
    </div>
  );
}

function TableDetails({ table, view, onChanged }: { table: PublishedTable; view?: TableView; onChanged: () => void }) {
  const { user } = useMe();
  const canManage = !!user?.accounts.includes(table.owner);

  useEffect(() => {
    document.title = `${table.title} · Skeletable`;
  }, [table.title]);

  if (view === "proposals") return <AllProposals table={table} canDecide={canManage} />;
  if (view === "history") return <AllChanges table={table} />;
  if (view === "settings") return <TableSettings table={table} onChanged={onChanged} />;

  return (
    <>
      <section className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-96">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{table.title}</h1>
            <Badge variant="outline">{table.draft ? "Draft" : table.private ? "Private" : "Public"}</Badge>
          </div>
          <p className="mt-1.5 max-w-2xl text-muted-foreground">{table.question}</p>
          <ForkedFrom table={table} />
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {!table.draft && <ShareButton table={table} path={`/${table.owner}/${table.slug}`} onChanged={onChanged} />}
          {((!table.draft && !table.private) || canManage) && <ForkButton table={table} />}
          <DownloadButton table={table} canRun={canManage} />
          {canManage && <AgentBuildButton table={table} />}
          {canManage && (
            <Button variant="outline" size="icon-lg" aria-label="Table settings" asChild>
              <Link href={`/${table.owner}/${table.slug}/settings`}><Settings2 /></Link>
            </Button>
          )}
          <Button size="lg" asChild>
            <Link href={`/${table.owner}/${table.slug}/sheet`}>
              Open sheet
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>
      <div className="mt-6"><Overview table={table} canDecide={canManage} onChanged={onChanged} /></div>
    </>
  );
}

/** A table's own page: what it is and how far to trust it, with the sheet one click away. */
export function TablePage({ owner, slug, view }: { owner: string; slug: string; view?: TableView }) {
  const { data, status, retry } = useJson<PublishedTable>(`/api/tables/${owner}/${slug}`);
  const crumbs = [
    { label: data ? ownerLabel(data) : accountName(owner), href: `/${owner}` },
    { label: data?.title ?? "Table", href: `/${owner}/${slug}` },
    ...(view ? [{ label: viewLabels[view] }] : []),
  ];
  return (
    <Page crumbs={crumbs}>
      <Content>
        {data && <nav aria-label="Table navigation" className="mb-6 flex gap-1 overflow-x-auto border-b pb-2">
          {[["", "Overview"], ["/proposals", "Proposals"], ["/history", "History"]].map(([suffix, label]) => <Button key={label} asChild size="sm" variant={(view ? `/${view}` : "") === suffix ? "secondary" : "ghost"}><Link href={`/${owner}/${slug}${suffix}`} aria-current={(view ? `/${view}` : "") === suffix ? "page" : undefined}>{label}</Link></Button>)}
        </nav>}
        {status === "missing" ? (
          <NoTable />
        ) : status === "failed" ? (
          <LoadFailed what="This table" retry={retry} />
        ) : data ? (
          <TableDetails table={data} view={view} onChanged={retry} />
        ) : (
          <div className="space-y-4" aria-label="Loading table">
            <Skeleton className="h-9 w-2/3" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-72 rounded-xl" />
          </div>
        )}
      </Content>
    </Page>
  );
}
