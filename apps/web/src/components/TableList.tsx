import { ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { TableSummary } from "@/lib/api";
import { accountName, day } from "@/lib/cells";
import { statuses } from "@/lib/status";

/** A small bar of how the table's values were checked, using the same colours as X-ray. */
function CheckBar({ table, className }: { table: TableSummary; className: string }) {
  const { confirmed, summary, once, gap } = table.checks;
  const parts = [["confirmed", confirmed], ["summary", summary], ["once", once], ["gap", gap]] as const;
  const total = confirmed + summary + once + gap;
  const filled = confirmed + summary + once;
  return (
    <div className={`shrink-0 sm:w-32 ${className}`} title={`${confirmed} confirmed by a blind read, ${summary} matched a summary, ${once} read once, ${gap} not stated`}>
      <div className="flex h-1.5 gap-px overflow-hidden rounded-full" aria-hidden="true">
        {parts.filter(([, count]) => count).map(([status, count]) => <div key={status} className={statuses[status].solid} style={{ width: `${(count / total) * 100}%` }} />)}
      </div>
      <p className="mt-1 text-xs text-muted-foreground tabular-nums sm:text-right">{filled ? `${Math.round(((confirmed + summary) / filled) * 100)}% of values checked twice` : "No values yet"}</p>
    </div>
  );
}

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
          <CheckBar table={table} className="mt-2 sm:hidden" />
        </div>
        <CheckBar table={table} className="hidden sm:block" />
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
        {[0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-[5.5rem] rounded-none" />)}
      </div>
    );
  }
  return (
    <ul className="overflow-hidden rounded-xl border">
      {tables.map((table) => <TableRow key={`${table.owner}/${table.slug}`} table={table} />)}
    </ul>
  );
}
