import { Spinner } from "@/components/Loading";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Content, LoadFailed, PageHeader } from "@/components/Layout";
import { Page } from "@/components/Shell";
import { TableList } from "@/components/TableList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useJson, type TableSummary } from "@/lib/api";
import { Message } from "@/pages/Message";

const sorts = {
  checked: { label: "Recently checked", order: (a: TableSummary, b: TableSummary) => b.lastChecked.localeCompare(a.lastChecked) },
  confirmed: { label: "Best checked", order: (a: TableSummary, b: TableSummary) => confirmedShare(b) - confirmedShare(a) },
  rows: { label: "Most rows", order: (a: TableSummary, b: TableSummary) => b.rows - a.rows },
  name: { label: "A to Z", order: (a: TableSummary, b: TableSummary) => a.title.localeCompare(b.title) },
};

/** Sourced tables quote a source for every value. Datasets and trackers say where each value came from instead. */
const kinds = { all: "Everything", sourced: "Sourced", datasets: "Datasets and trackers" } as const;
type Kind = keyof typeof kinds;
const isKind = (table: TableSummary, kind: Kind) => kind === "all" || (kind === "datasets") === (table.proof === "optional");

const confirmedShare = ({ checks: { confirmed, summary, once, given = 0, gap } }: TableSummary) => (confirmed + summary) / (confirmed + summary + once + given + gap || 1);

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
        <PageHeader title="Browse tables" description="Every value here shows where it came from. Sourced tables quote a source for each one, and datasets and trackers say whether a value was linked, entered, imported or generated. Fork any of them to make it your own." />
        <div className="mb-4 inline-flex rounded-lg border p-0.5" role="group" aria-label="Kind of table">
          {(Object.keys(kinds) as Kind[]).map((name) => (
            <Button key={name} variant="ghost" size="sm" aria-pressed={kind === name} className={kind === name ? "bg-secondary text-foreground" : "text-muted-foreground"} onClick={() => { setKind(name); setTopic(undefined); }}>{kinds[name]}</Button>
          ))}
        </div>
        <div className="relative max-w-xl">
          {refreshing ? <Spinner label="Updating search results" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" /> : <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />}
          <Input
            className="h-12 rounded-lg bg-card pl-9 shadow-none"
            type="search"
            aria-label="Search tables"
            placeholder="Search tables and rows"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="mt-6 mb-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by topic">
            {[undefined, ...topics].map((name) => (
              <Button key={name ?? "all"} variant="ghost" className={topic === name ? "rounded-full bg-secondary text-foreground" : "rounded-full text-muted-foreground"} size="sm" aria-pressed={topic === name} onClick={() => setTopic(name)}>
                {name ?? "All"}
                <span className="opacity-60 tabular-nums">{name ? topicCount(name) : library?.length}</span>
              </Button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Sort
            <NativeSelect value={sort} onChange={(event) => setSort(event.target.value as keyof typeof sorts)} className="h-7 text-xs text-foreground">
              {Object.entries(sorts).map(([value, { label }]) => <option key={value} value={value}>{label}</option>)}
            </NativeSelect>
          </label>
        </div>
        {refreshFailed && <p role="status" className="mb-3 text-sm text-muted-foreground">Couldn’t update results. Showing the previous results. <Button variant="link" size="sm" onClick={retry}>Retry</Button></p>}
        {status === "failed" ? (
          <LoadFailed what="The tables" retry={retry} />
        ) : shown?.length === 0 ? (
          <Message
            title={query ? `No table covers "${query}" yet` : "No tables here yet"}
            action={<Button variant="outline" size="sm" onClick={() => { setQuery(""); setTopic(undefined); }}>See all tables</Button>}
          />
        ) : (
          <TableList tables={shown} compact />
        )}
      </Content>
    </Page>
  );
}
