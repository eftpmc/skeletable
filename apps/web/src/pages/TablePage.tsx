import { ArrowRight, ExternalLink, GitPullRequestArrow, History, LayoutList, Settings, type LucideIcon } from "lucide-react";
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

const PREVIEW_ROWS = 6;

export const tableTabs = ["proposals", "history", "settings"] as const;
export type TableTab = (typeof tableTabs)[number];

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
  return (
    <aside className="space-y-6 md:order-last">
      <Section title="About">
        <p className="text-sm text-muted-foreground">{table.question}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge variant="secondary">{table.topic}</Badge>
          <Badge variant="outline">{table.rows.length} rows</Badge>
          <Badge variant="outline">{Math.round((filled.length / cells.length) * 100)}% filled</Badge>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Last checked {day(lastChecked)}</p>
      </Section>
      <Section title="How it's checked"><Health table={table} /></Section>
      <Section title="Sources"><Sources table={table} /></Section>
    </aside>
  );
}

function Overview({ table }: { table: PublishedTable }) {
  const [, navigate] = useLocation();
  const sheet = `/${table.owner}/${table.slug}/sheet`;
  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_16rem]">
      <About table={table} />
      <div className="min-w-0 space-y-8">
        <div className="flex flex-col overflow-hidden rounded-xl border">
          <Grid table={{ ...table, rows: table.rows.slice(0, PREVIEW_ROWS) }} selectedId={null} select={(id) => id && navigate(`${sheet}?cell=${id}`)} emptyRows={0} />
        </div>
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
        <Section title="What it covers"><p className="text-sm text-muted-foreground">{table.scope}</p></Section>
      </div>
    </div>
  );
}

const Empty = ({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) => (
  <div className="rounded-xl border py-14 text-center">
    <Icon className="mx-auto size-6 text-muted-foreground" />
    <p className="mt-3 font-medium">{title}</p>
    <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>
  </div>
);

function Tabs({ table, tab, canManage }: { table: PublishedTable; tab?: TableTab; canManage: boolean }) {
  const base = `/${table.owner}/${table.slug}`;
  const items: { href: string; label: string; icon: LucideIcon; active: boolean }[] = [
    { href: base, label: "Overview", icon: LayoutList, active: !tab },
    { href: `${base}/proposals`, label: "Proposals", icon: GitPullRequestArrow, active: tab === "proposals" },
    { href: `${base}/history`, label: "History", icon: History, active: tab === "history" },
    ...(canManage ? [{ href: `${base}/settings`, label: "Settings", icon: Settings, active: tab === "settings" }] : []),
  ];
  return (
    <nav aria-label="Table" className="-mx-4 mt-5 mb-6 flex gap-1 overflow-x-auto overflow-y-hidden border-b px-4 sm:mx-0 sm:px-0">
      {items.map(({ href, label, icon: Icon, active }) => (
        <Link
          key={href}
          href={href}
          aria-current={active ? "page" : undefined}
          className="-mb-px flex shrink-0 items-center gap-1.5 border-b-2 border-transparent px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:border-green-600 aria-[current=page]:font-medium aria-[current=page]:text-foreground"
        >
          <Icon className="size-4" />
          {label}
        </Link>
      ))}
    </nav>
  );
}

function TableDetails({ table, tab }: { table: PublishedTable; tab?: TableTab }) {
  const { user } = useMe();
  const canManage = !!user?.accounts.includes(table.owner);

  useEffect(() => {
    document.title = `${table.title} · Skeletable`;
  }, [table.title]);

  if (tab === "settings" && !canManage) return <Message title="Only this table's owner can open its settings" />;

  return (
    <>
      <section className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-xl tracking-tight sm:text-2xl">
            <Link href={`/${table.owner}`} className="text-muted-foreground hover:text-foreground hover:underline">{accountName(table.owner)}</Link>
            <span className="mx-1.5 text-muted-foreground">/</span>
            <span className="font-semibold">{table.title}</span>
          </h1>
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
      <Tabs table={table} tab={tab} canManage={canManage} />
      {!tab && <Overview table={table} />}
      {tab === "proposals" && <Empty icon={GitPullRequestArrow} title="No proposals yet" body="Suggested changes to this table will appear here, each with its source and quote." />}
      {tab === "history" && <Empty icon={History} title="No changes yet" body="Every change to a value will be listed here, so you can see what it used to say and why it moved." />}
      {tab === "settings" && <Empty icon={Settings} title="Nothing to set yet" body="Table settings will live here as they're added." />}
    </>
  );
}

/** A table's own page: what it is and how far to trust it, with the sheet one click away. */
export function TablePage({ owner, slug, tab }: { owner: string; slug: string; tab?: TableTab }) {
  const { data, status, retry } = useJson<PublishedTable>(`/api/tables/${owner}/${slug}`);
  return (
    <Page>
      <main className="mx-auto max-w-5xl px-4 pt-6 pb-16 sm:px-6">
        {status === "missing" ? (
          <Message title="There's no table here" />
        ) : status === "failed" ? (
          <Message title="This table didn't load" action={<Button variant="outline" size="sm" onClick={retry}>Try again</Button>} />
        ) : data ? (
          <TableDetails table={data} tab={tab} />
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
