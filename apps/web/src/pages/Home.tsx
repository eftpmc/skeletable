import { Check, Copy, Search } from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useJson, type TableSummary } from "@/lib/api";
import { Message } from "@/pages/Message";

function TableCard({ table }: { table: TableSummary }) {
  return (
    <Link href={`/tables/${table.slug}`} className="rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
      <Card className="h-full transition-colors hover:bg-muted/50">
        <CardHeader>
          <CardTitle>{table.title}</CardTitle>
          <CardDescription>{table.question}</CardDescription>
        </CardHeader>
        <CardFooter className="mt-auto gap-2">
          <Badge variant="secondary">{table.rows} rows</Badge>
          <Badge variant="outline">{table.filled}</Badge>
        </CardFooter>
      </Card>
    </Link>
  );
}

function ConnectCard() {
  const command = `claude mcp add --transport http skeleton ${location.origin}/mcp`;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Card className="mt-10">
      <CardHeader>
        <CardTitle>Use these from an agent</CardTitle>
        <CardDescription>A read-only MCP server. No account needed.</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-2">
        <code className="min-w-0 flex-1 rounded-md bg-muted px-3 py-2 font-mono text-xs break-all">{command}</code>
        <Button variant="outline" size="icon" onClick={copy} aria-label={copied ? "Copied" : "Copy command"}>
          {copied ? <Check /> : <Copy />}
        </Button>
      </CardContent>
    </Card>
  );
}

export function Home() {
  const [, navigate] = useLocation();
  const query = new URLSearchParams(useSearch()).get("q") ?? "";
  const { data, status, retry } = useJson<TableSummary[]>(`/api/tables?q=${encodeURIComponent(query)}`);
  return (
    <>
      <section className="py-10 sm:py-14">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Tables where every value shows its source</h1>
        <p className="mt-2 text-muted-foreground">Select any value to see the words that state it, or where we looked.</p>
        <div className="relative mt-6 max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            type="search"
            aria-label="Search the tables"
            placeholder="Search tables and rows"
            value={query}
            onChange={(event) => {
              const q = event.target.value;
              navigate(q ? `/?q=${encodeURIComponent(q)}` : "/", { replace: true });
            }}
          />
        </div>
      </section>
      {status === "failed" ? (
        <Message title="The tables didn't load" action={<Button variant="outline" size="sm" onClick={retry}>Try again</Button>} />
      ) : !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading tables">
          {[0, 1, 2, 3, 4, 5].map((index) => <Skeleton key={index} className="h-44 rounded-xl" />)}
        </div>
      ) : data.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((table) => <TableCard key={table.slug} table={table} />)}
        </div>
      ) : (
        <Message title={`No table covers "${query}"`} />
      )}
      <ConnectCard />
    </>
  );
}
