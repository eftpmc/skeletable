import { Spinner } from "@/components/Loading";
import { ArrowUpRight, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Content, LoadFailed } from "@/components/Layout";
import { Page } from "@/components/Shell";
import { CheckBar } from "@/components/TableList";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useJson, type TableSummary } from "@/lib/api";
import { day } from "@/lib/cells";
import { Message } from "@/pages/Message";

const sorts = {
  checked: { label: "Recently checked", order: (a: TableSummary, b: TableSummary) => b.lastChecked.localeCompare(a.lastChecked) },
  confirmed: { label: "Best checked", order: (a: TableSummary, b: TableSummary) => confirmedShare(b) - confirmedShare(a) },
  rows: { label: "Most rows", order: (a: TableSummary, b: TableSummary) => b.rows - a.rows },
  name: { label: "A to Z", order: (a: TableSummary, b: TableSummary) => a.title.localeCompare(b.title) },
};

/** Sourced tables quote a source for every value. Datasets and trackers say where each value came from instead. */
const kinds = { all: "All", sourced: "Sourced", datasets: "Datasets" } as const;
type Kind = keyof typeof kinds;
const isKind = (table: TableSummary, kind: Kind) => kind === "all" || (kind === "datasets") === (table.proof === "optional");

const confirmedShare = ({ checks: { confirmed, summary, once, given = 0, gap } }: TableSummary) => (confirmed + summary) / (confirmed + summary + once + given + gap || 1);

const COLUMNS_SHOWN = 4;

/** One table as a card: what it answers, what it holds, and how well it's checked. */
function TableCard({ table }: { table: TableSummary }) {
  const href = `/${table.owner}/${table.slug}`;
  const extra = table.columns.length - COLUMNS_SHOWN;
  return (
    <li>
      <Link
        href={href}
        className="group flex h-full flex-col rounded-xl border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-md hover:shadow-brand/5 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
      >
        <div className="flex items-center justify-between gap-3">
          <p className="eyebrow truncate">{table.topic}</p>
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground uppercase">{table.proof === "optional" ? "Dataset" : "Sourced"}</span>
        </div>
        <h2 className="mt-2 flex items-start gap-1 font-semibold tracking-tight text-balance">
          <span className="min-w-0 flex-1">{table.title}</span>
          <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </h2>
        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground" title={table.question}>{table.question}</p>
        <ul className="mt-3 flex flex-wrap gap-1" aria-label="Columns">
          {table.columns.slice(0, COLUMNS_SHOWN).map((column) => <li key={column} className="max-w-full truncate rounded border bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{column}</li>)}
          {extra > 0 && <li className="px-1 py-0.5 font-mono text-[10px] text-muted-foreground">+{extra} more</li>}
        </ul>
        <div className="mt-auto pt-5">
          <CheckBar table={table} className="w-full" />
          <p className="mt-2.5 flex flex-wrap gap-x-1.5 text-xs text-muted-foreground tabular-nums">
            <span>{table.rows} rows</span>
            <span aria-hidden="true">&middot;</span>
            <span>Checked {day(table.lastChecked).replace(/,? \d{4}$/, "")}</span>
          </p>
        </div>
      </Link>
    </li>
  );
}

export function Explore() {
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState<string>();
  const [kind, setKind] = useState<Kind>("all");
  const { data, status, retry, refreshing, refreshFailed } = useJson<TableSummary[]>(`/api/tables?q=${encodeURIComponent(query)}`);
  const all = useJson<TableSummary[]>("/api/tables");
  const [sort, setSort] = useState<keyof typeof sorts>("checked");
  // Browse is the public library, even when you can also see private tables.
  const library = all.data?.filter((table) => !table.private && isKind(table, kind));
  const topicCount = (name: string) => library?.filter((table) => table.topic === name).length ?? 0;
  const topics = [...new Set(library?.map((table) => table.topic))].sort();
  const shown = data?.filter((table) => !table.private && isKind(table, kind) && (!topic || table.topic === topic)).sort(sorts[sort].order);

  useEffect(() => {
    document.title = "Browse tables · Skeletable";
  }, []);

  return (
    <Page>
      <Content>
        <header className="mb-8 max-w-2xl">
          <p className="eyebrow">The library</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Browse tables</h1>
          <p className="mt-2 text-muted-foreground">Every value shows where it came from. Open one to check its sources, or fork it to make it your own.</p>
        </header>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            {refreshing ? <Spinner label="Updating search results" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" /> : <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />}
            <Input
              className="h-10 rounded-lg bg-card pl-9 shadow-none"
              type="search"
              aria-label="Search tables"
              placeholder="Search tables and rows"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex h-10 items-center rounded-lg border bg-card p-0.5" role="group" aria-label="Kind of table" title="Sourced tables quote a source for each value. Datasets say whether a value was linked, entered, imported or generated.">
              {(Object.keys(kinds) as Kind[]).map((name) => (
                <Button key={name} variant="ghost" size="sm" aria-pressed={kind === name} className={kind === name ? "bg-secondary text-foreground" : "text-muted-foreground"} onClick={() => { setKind(name); setTopic(undefined); }}>{kinds[name]}</Button>
              ))}
            </div>
            <NativeSelect aria-label="Sort" value={sort} onChange={(event) => setSort(event.target.value as keyof typeof sorts)} className="h-10 bg-card text-sm">
              {Object.entries(sorts).map(([value, { label }]) => <option key={value} value={value}>{label}</option>)}
            </NativeSelect>
          </div>
        </div>
        <div className="-mx-4 mt-4 mb-6 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Filter by topic">
          {[undefined, ...topics].map((name) => (
            <Button key={name ?? "all"} variant="outline" size="sm" className={`shrink-0 rounded-full ${topic === name ? "border-foreground bg-foreground text-background hover:bg-foreground/90 hover:text-background" : "bg-card text-muted-foreground"}`} aria-pressed={topic === name} onClick={() => setTopic(name)}>
              {name ?? "All topics"}
              <span className="font-mono text-[11px] opacity-60 tabular-nums">{name ? topicCount(name) : library?.length}</span>
            </Button>
          ))}
        </div>
        {refreshFailed && <p role="status" className="mb-3 text-sm text-muted-foreground">Couldn’t update results. Showing the previous results. <Button variant="link" size="sm" onClick={retry}>Retry</Button></p>}
        {status === "failed" ? (
          <LoadFailed what="The tables" retry={retry} />
        ) : shown?.length === 0 ? (
          <Message
            title={query ? `No table covers "${query}" yet` : "No tables here yet"}
            action={<Button variant="outline" size="sm" onClick={() => { setQuery(""); setTopic(undefined); }}>See all tables</Button>}
          />
        ) : shown ? (
          <>
            <p className="mb-3 text-sm text-muted-foreground" role="status">{shown.length} {shown.length === 1 ? "table" : "tables"}{topic ? ` in ${topic}` : ""}{query ? ` matching "${query}"` : ""}</p>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((table) => <TableCard key={`${table.owner}/${table.slug}`} table={table} />)}
            </ul>
          </>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading tables">
            {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-60 rounded-xl" />)}
          </div>
        )}
      </Content>
    </Page>
  );
}
