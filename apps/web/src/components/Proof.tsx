import type { FoundCell, GivenCell } from "@skeleton/tables/format";
import { cellPaths, displayValue, quoteLink } from "@skeleton/tables/share";
import { ExternalLink, Link2 } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { day, host, splitQuote } from "@/lib/cells";
import { copyText } from "@/lib/copy";
import { statuses, type CellStatus } from "@/lib/status";

export const kindLabels: Record<FoundCell["kind"], string> = {
  "first-hand": "First-hand",
  archived: "Archived copy",
  "second-hand": "Second-hand",
};

/** A link to a source. Given the quote, it opens at those words. */
export const SourceLink = ({ url, label, quote }: { url: string; label: string; quote?: string }) => (
  <Button variant="outline" size="xs" className="max-w-full" asChild>
    <a href={quote ? quoteLink(url, quote) : url} target="_blank" rel="noopener noreferrer">
      <span className="truncate">{label}</span>
      <ExternalLink />
    </a>
  </Button>
);

/** The source's exact words, with the part that states the value marked. */
export function Quote({ cell }: { cell: Pick<FoundCell, "value" | "quote"> }) {
  const [before, match, after] = splitQuote(cell.value, cell.quote);
  return (
    <p className="break-words text-muted-foreground">
      {before}
      {match && <mark className="rounded-sm bg-brand/25 px-0.5 font-medium text-foreground">{match}</mark>}
      {after}
    </p>
  );
}

export function StatusBadge({ status }: { status: CellStatus }) {
  const { label, detail, icon: Icon } = statuses[status];
  return (
    <Badge variant="outline" title={detail}>
      <Icon />
      {label}
    </Badge>
  );
}

/** A citation someone can paste: the words, where they're from, when we read them, and where we show them. */
export const citation = (cell: FoundCell, title: string, url: string) => `"${cell.quote}" Source: ${cell.source}, read ${cell.read}. Via Skeletable, ${title}: ${url}`;

export type CellAddress = { table: { owner: string; slug: string; title: string; private?: boolean; rows: { key: string }[] }; rowKey: string; columnId: string };

/** Every way to take a value elsewhere. A private table's data and cards aren't public, so it only gives a link. */
export function CiteButton({ cell, address: { table, rowKey, columnId } }: { cell?: FoundCell; address: CellAddress }) {
  const { page, value, embed } = cellPaths(table, rowKey, columnId);
  const at = (path: string) => `${location.origin}${path}`;
  const copy = (text: string, label: string) => () => void copyText(text, `${label} copied`);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="xs"><Link2 />Cite</Button></DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuItem onSelect={copy(at(page), "Link")}>Copy link to this value</DropdownMenuItem>
        {cell && <DropdownMenuItem onSelect={copy(citation(cell, table.title, at(page)), "Citation")}>Copy citation</DropdownMenuItem>}
        {!table.private && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={copy(`<iframe src="${at(embed)}" title="${rowKey} on Skeletable" width="100%" height="150" style="border:0" loading="lazy"></iframe>`, "Embed code")}>Copy live embed</DropdownMenuItem>
            <DropdownMenuItem onSelect={copy(`=IMPORTDATA("${at(value)}")`, "Formula")}>Copy Google Sheets formula</DropdownMenuItem>
            <DropdownMenuItem onSelect={copy(`=WEBSERVICE("${at(value)}")`, "Formula")}>Copy Excel formula</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** What other sources state instead, each with its own proof. */
export const Conflicts = ({ cell }: { cell: FoundCell }) =>
  cell.conflicts?.length ? (
    <ul className="space-y-1.5 border-t pt-1.5">
      {cell.conflicts.map((conflict) => (
        <li key={conflict.source + conflict.quote} className="space-y-1">
          <p className="text-xs font-medium">Another source states {displayValue(conflict.value)}</p>
          <Quote cell={conflict} />
          <SourceLink url={conflict.source} label={host(conflict.source)} quote={conflict.quote} />
        </li>
      ))}
    </ul>
  ) : null;

/** Where a value without a quote came from, used wherever a value is shown on its own. */
export const OriginDetails = ({ cell, status, actions, prompt }: { cell: GivenCell; status: CellStatus; actions?: ReactNode; prompt?: { text: string; stale: boolean } }) => (
  <div className="space-y-1.5 text-sm">
    <p className="text-muted-foreground">{statuses[status].detail}{prompt ? ", answering this row's prompt" : ""}. It has no quote, so check it before relying on it.</p>
    {prompt ? (
      <>
        <p className="border-l-2 border-indigo-400 pl-3 break-words whitespace-pre-line text-xs text-muted-foreground">{prompt.text}</p>
        {prompt.stale && <p className="text-xs font-medium text-orange-600 dark:text-orange-400">Out of date: the row or the instruction changed since. Your agent will answer it again.</p>}
      </>
    ) : cell.note && <p className="border-l-2 pl-3 break-words text-xs text-muted-foreground">{cell.note}</p>}
    <div className="flex flex-wrap items-center gap-1.5">
      {cell.source && <SourceLink url={cell.source} label={host(cell.source)} />}
      <StatusBadge status={status} />
      {cell.model && <Badge variant="outline" title="The model that wrote it">{cell.model}</Badge>}
      {actions}
      <Badge variant="outline">Set {day(cell.read)}</Badge>
    </div>
  </div>
);

/** One value's proof, used wherever a value is shown on its own. */
export const ProofDetails = ({ cell, status, cite }: { cell: FoundCell; status?: CellStatus; cite: ReactNode }) => (
  <div className="space-y-1.5 text-sm">
    <Quote cell={cell} />
    <Conflicts cell={cell} />
    <div className="flex flex-wrap items-center gap-1.5">
      <SourceLink url={cell.source} label={host(cell.source)} quote={cell.quote} />
      <Badge variant="secondary">{kindLabels[cell.kind]}</Badge>
      {status && <StatusBadge status={status} />}
      {cite}
    </div>
  </div>
);
