import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { AgentButton, Logo, ThemeButton } from "@/components/Chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useJson, type TableSummary } from "@/lib/api";
import { accountName, display } from "@/lib/cells";
import { Message } from "@/pages/Message";

/** A real corner of the table, drawn small, so a card looks like the sheet it opens. */
function Thumbnail({ table }: { table: TableSummary }) {
  return (
    <div className="h-36 overflow-hidden border-b bg-background" aria-hidden="true">
      <table className="w-full border-separate border-spacing-0 text-[9px] leading-3 text-muted-foreground tabular-nums">
        <thead>
          <tr className="bg-muted">
            {["", ...table.preview.columns].map((label, index) => (
              <th key={index} className="max-w-20 truncate border-r border-b px-1.5 py-1 text-left font-medium last:border-r-0">{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.preview.rows.map(([key, ...values]) => (
            <tr key={String(key)}>
              <td className="max-w-24 truncate border-r border-b px-1.5 py-1 font-medium text-foreground">{String(key)}</td>
              {values.map((value, index) => (
                <td key={index} className="max-w-20 truncate border-r border-b px-1.5 py-1 last:border-r-0">{value === null ? "" : display(value)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableCard({ table }: { table: TableSummary }) {
  return (
    <Link
      href={`/${table.owner}/${table.slug}`}
      className="group overflow-hidden rounded-xl border bg-card transition duration-200 hover:-translate-y-0.5 hover:border-green-600/50 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <Thumbnail table={table} />
      <div className="flex items-start gap-2.5 p-3">
        <Logo className="mt-0.5 size-5 shrink-0" />
        <div className="min-w-0">
          <h2 className="truncate text-sm font-medium">{table.title.split(":")[0]}</h2>
          <p className="truncate text-xs text-muted-foreground">by {accountName(table.owner)} · {table.rows} rows</p>
        </div>
      </div>
    </Link>
  );
}

export function Home() {
  const [query, setQuery] = useState("");
  const { data, status, retry } = useJson<TableSummary[]>(`/api/tables?q=${encodeURIComponent(query)}`);
  useEffect(() => {
    document.title = "skeleton";
  }, []);
  return (
    <div className="min-h-svh">
      <header className="flex items-center gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-base font-medium tracking-tight">
          <Logo />
          <span className="hidden sm:inline">skeleton</span>
        </Link>
        <div className="relative mx-auto w-full max-w-xl">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-10 rounded-full border-transparent bg-muted pl-10"
            type="search"
            aria-label="Search the tables"
            placeholder="Search tables and rows"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <AgentButton />
          <ThemeButton />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pt-10 pb-16 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Every value shows its source</h1>
        <p className="mt-2 mb-8 text-muted-foreground">Open a table and select any cell to see the words that prove it.</p>
        {status === "failed" ? (
          <Message title="The tables didn't load" action={<Button variant="outline" size="sm" onClick={retry}>Try again</Button>} />
        ) : !data ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-label="Loading tables">
            {[0, 1, 2, 3, 4, 5].map((index) => <Skeleton key={index} className="h-52 rounded-xl" />)}
          </div>
        ) : data.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {data.map((table) => <TableCard key={table.slug} table={table} />)}
          </div>
        ) : (
          <Message title={`No table covers "${query}" yet`} action={<Button variant="outline" size="sm" onClick={() => setQuery("")}>See all tables</Button>} />
        )}
      </main>
    </div>
  );
}
