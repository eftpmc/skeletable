import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Page } from "@/components/Shell";
import { TableList } from "@/components/TableList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useJson, type TableSummary } from "@/lib/api";
import { Message } from "@/pages/Message";

const sorts = {
  checked: { label: "Recently checked", order: (a: TableSummary, b: TableSummary) => b.lastChecked.localeCompare(a.lastChecked) },
  confirmed: { label: "Best checked", order: (a: TableSummary, b: TableSummary) => confirmedShare(b) - confirmedShare(a) },
  rows: { label: "Most rows", order: (a: TableSummary, b: TableSummary) => b.rows - a.rows },
  name: { label: "A to Z", order: (a: TableSummary, b: TableSummary) => a.title.localeCompare(b.title) },
};

const confirmedShare = ({ checks: { confirmed, summary, once, gap } }: TableSummary) => (confirmed + summary) / (confirmed + summary + once + gap);

export function Explore() {
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState<string>();
  const { data, status, retry } = useJson<TableSummary[]>(`/api/tables?q=${encodeURIComponent(query)}`);
  const all = useJson<TableSummary[]>("/api/tables");
  const [sort, setSort] = useState<keyof typeof sorts>("checked");
  const topicCount = (name: string) => all.data?.filter((table) => table.topic === name).length ?? 0;
  const topics = [...new Set(all.data?.map((table) => table.topic))].sort();
  const shown = data?.filter((table) => !topic || table.topic === topic).sort(sorts[sort].order);

  useEffect(() => {
    document.title = "Browse tables · Skeletable";
  }, []);

  return (
    <Page>
      <main className="mx-auto max-w-5xl px-4 pt-8 pb-16 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Browse tables</h1>
        <p className="mt-1 text-muted-foreground">Every value here shows its source. Open a table to see how well it's been checked.</p>
        <div className="relative mt-5">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-10 pl-9"
            type="search"
            aria-label="Search tables"
            placeholder="Search tables and rows"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="mt-3 mb-5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by topic">
            {[undefined, ...topics].map((name) => (
              <Button key={name ?? "all"} variant={topic === name ? "default" : "outline"} size="xs" aria-pressed={topic === name} onClick={() => setTopic(name)}>
                {name ?? "All"}
                <span className="opacity-60 tabular-nums">{name ? topicCount(name) : all.data?.length}</span>
              </Button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Sort
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as keyof typeof sorts)}
              className="h-6 rounded-md border bg-transparent px-1 text-xs text-foreground dark:bg-input/30"
            >
              {Object.entries(sorts).map(([value, { label }]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
        {status === "failed" ? (
          <Message title="The tables didn't load" action={<Button variant="outline" size="sm" onClick={retry}>Try again</Button>} />
        ) : shown?.length === 0 ? (
          <Message
            title={query ? `No table covers "${query}" yet` : "No tables here yet"}
            action={<Button variant="outline" size="sm" onClick={() => { setQuery(""); setTopic(undefined); }}>See all tables</Button>}
          />
        ) : (
          <TableList tables={shown} />
        )}
      </main>
    </Page>
  );
}
