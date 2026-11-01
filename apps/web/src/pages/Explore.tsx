import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { TableList } from "@/components/TableList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useJson, type TableSummary } from "@/lib/api";
import { Message } from "@/pages/Message";

export function Explore() {
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState<string>();
  const { data, status, retry } = useJson<TableSummary[]>(`/api/tables?q=${encodeURIComponent(query)}`);
  const all = useJson<TableSummary[]>("/api/tables");
  const topics = [...new Set(all.data?.map((table) => table.topic))].sort();
  const shown = data?.filter((table) => !topic || table.topic === topic);

  useEffect(() => {
    document.title = "Browse tables · Skeletable";
  }, []);

  return (
    <Shell>
      <main className="mx-auto max-w-4xl px-4 pt-8 pb-16 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Browse tables</h1>
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
        <div className="mt-3 mb-5 flex flex-wrap gap-1.5" role="group" aria-label="Filter by topic">
          {[undefined, ...topics].map((name) => (
            <Button key={name ?? "all"} variant={topic === name ? "default" : "outline"} size="xs" aria-pressed={topic === name} onClick={() => setTopic(name)}>
              {name ?? "All"}
            </Button>
          ))}
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
    </Shell>
  );
}
