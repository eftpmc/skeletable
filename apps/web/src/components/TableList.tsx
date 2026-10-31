import { ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { TableSummary } from "@/lib/api";
import { accountName, day } from "@/lib/cells";

function TableRow({ table }: { table: TableSummary }) {
  return (
    <li className="border-b last:border-b-0">
      <Link
        href={`/${table.owner}/${table.slug}`}
        className="group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="font-medium">{table.title}</h2>
            <Badge variant="secondary">{table.topic}</Badge>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{table.question}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            by {accountName(table.owner)} · {table.rows} rows · {table.filled} · Checked {day(table.lastChecked)}
          </p>
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </Link>
    </li>
  );
}

/** Tables as an easy list to scan. `tables` is empty while they load. */
export function TableList({ tables }: { tables?: TableSummary[] }) {
  if (!tables) {
    return (
      <div className="space-y-px overflow-hidden rounded-xl border" aria-label="Loading tables">
        {[0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-24 rounded-none" />)}
      </div>
    );
  }
  return (
    <ul className="overflow-hidden rounded-xl border">
      {tables.map((table) => <TableRow key={`${table.owner}/${table.slug}`} table={table} />)}
    </ul>
  );
}
