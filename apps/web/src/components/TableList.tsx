import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { AccountMark } from "@/components/AccountMark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListSkeleton } from "@/components/Loading";
import type { TableSummary } from "@/lib/api";
import { day, ownerLabel } from "@/lib/cells";
import { statuses } from "@/lib/status";

/** A small bar of how the table's values were checked, using the same colours as X-ray. */
function CheckBar({ table, className }: { table: TableSummary; className: string }) {
  const { confirmed, summary, once, given = 0, gap } = table.checks;
  const parts = [["confirmed", confirmed], ["summary", summary], ["once", once], ["linked", given], ["gap", gap]] as const;
  const total = confirmed + summary + once + given + gap;
  const filled = confirmed + summary + once;
  return (
    <div className={`shrink-0 sm:w-36 ${className}`} title={`Double-checked means a filled value was confirmed by a second read or matched a summary. Missing values are excluded from the percentage. ${confirmed} confirmed by a blind read, ${summary} matched a summary, ${once} read once,${given ? ` ${given} without a quote,` : ""} ${gap} not stated`}>
      <p className="mb-2 text-xs text-muted-foreground tabular-nums">{filled ? `${Math.round(((confirmed + summary) / filled) * 100)}% double-checked` : given ? `${given} values, no quotes` : "No values yet"}</p>
      <div className="flex h-1 gap-px overflow-hidden rounded-full bg-muted" aria-hidden="true">
        {parts.filter(([, count]) => count).map(([status, count]) => <div key={status} className={statuses[status].solid} style={{ width: `${(count / total) * 100}%` }} />)}
      </div>
    </div>
  );
}

function TableRow({ table, compact }: { table: TableSummary; compact: boolean }) {
  const checked = day(table.lastChecked);
  const date = compact && table.lastChecked.startsWith(String(new Date().getFullYear())) ? checked.replace(/,? \d{4}$/, "") : checked;
  const metadata = [
    `${table.rows} rows`,
    compact ? table.filled.replace(/(\d+) of (\d+)/, "$1/$2") : table.filled,
    `Checked ${date}`,
  ];
  return (
    <li className="border-b last:border-b-0">
      <div className={`group flex items-center gap-4 px-2 transition-colors hover:bg-muted/50 sm:px-3 ${compact ? "py-4" : "py-6"}`}>
        <div className="min-w-0 flex-1">
          {!compact && <p className="mb-2 text-[11px] font-medium tracking-widest text-muted-foreground uppercase">{table.topic}</p>}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className={`${compact ? "text-base font-medium" : "text-lg font-semibold"} tracking-tight`}><Link href={`/${table.owner}/${table.slug}`} className="hover:text-brand focus-visible:text-brand focus-visible:underline focus-visible:outline-none">{table.title}</Link></h2>
            {compact && <span className="text-xs text-muted-foreground">{table.topic}</span>}
            {table.draft ? <Badge variant="outline">Draft</Badge> : table.private && <Badge variant="outline">Private</Badge>}
            {table.proof !== "optional" && <Badge variant="secondary" title="Every value quotes the source that states it">Sourced</Badge>}
          </div>
          <Link href={`/${table.owner}/${table.slug}`} title={compact ? table.question : undefined} className={compact ? "mt-1 block line-clamp-2 text-sm text-muted-foreground sm:line-clamp-1" : "mt-1.5 block max-w-xl text-sm leading-relaxed text-muted-foreground"}>{table.question}</Link>
          <p className={`${compact ? "mt-2" : "mt-3"} flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground`}>
            <Link href={`/${table.owner}`} className="inline-flex items-center gap-1.5 hover:text-foreground focus-visible:text-foreground focus-visible:outline-none">
              <AccountMark handle={table.owner} name={ownerLabel(table)} kind={table.ownerName ? "team" : "person"} className="size-4 text-[9px]" />
              <span>by {ownerLabel(table)}</span>
            </Link>
            {metadata.map((item, index) => <span key={index} className="inline-flex items-center gap-2"><span aria-hidden="true">&middot;</span>{item}</span>)}
          </p>
          <CheckBar table={table} className={`${compact ? "mt-2" : "mt-4"} max-w-36 sm:hidden`} />
        </div>
        <Link href={`/${table.owner}/${table.slug}`} aria-label={`Open ${table.title}`} className="flex shrink-0 items-center gap-4 rounded-sm focus-visible:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
          <CheckBar table={table} className="hidden sm:block" />
          <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </li>
  );
}

const PAGE = 25;

/** Tables as an easy list to scan, a page at a time. `tables` is empty while they load. */
export function TableList({ tables, compact = true }: { tables?: TableSummary[]; compact?: boolean }) {
  const [shown, setShown] = useState(PAGE);
  if (!tables) {
    return <ListSkeleton label="Loading tables" compact={compact} />;
  }
  return (
    <>
      <ul className="overflow-hidden rounded-xl border">
        {tables.slice(0, shown).map((table) => <TableRow key={`${table.owner}/${table.slug}`} table={table} compact={compact} />)}
      </ul>
      {tables.length > shown && (
        <div className="mt-3 text-center"><Button variant="outline" size="sm" onClick={() => setShown(shown + PAGE)}>Show more</Button></div>
      )}
    </>
  );
}
