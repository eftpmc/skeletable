import type { FoundCell } from "@skeleton/tables/format";
import { displayValue, quoteLink } from "@skeleton/tables/share";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { host, splitQuote } from "@/lib/cells";
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

export const CiteButton = ({ cell, title, url }: { cell: FoundCell; title: string; url: string }) => (
  <Button variant="ghost" size="xs" onClick={() => copyText(citation(cell, title, url), "Citation copied")}>Cite</Button>
);

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

/** One value's proof, used wherever a value is shown on its own. */
export const ProofDetails = ({ cell, status, title, url }: { cell: FoundCell; status?: CellStatus; title: string; url: string }) => (
  <div className="space-y-1.5 text-sm">
    <Quote cell={cell} />
    <Conflicts cell={cell} />
    <div className="flex flex-wrap items-center gap-1.5">
      <SourceLink url={cell.source} label={host(cell.source)} quote={cell.quote} />
      <Badge variant="secondary">{kindLabels[cell.kind]}</Badge>
      {status && <StatusBadge status={status} />}
      <CiteButton cell={cell} title={title} url={url} />
    </div>
  </div>
);
