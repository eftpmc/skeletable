import type { Cell, FoundCell } from "@skeleton/tables/format";
import { ArrowRight, Bot, CircleCheck, CircleHelp, ExternalLink, GitPullRequestArrow, History, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { postJson, useJson } from "@/lib/api";
import { day, display, host } from "@/lib/cells";
import type { PublishedTable } from "@/lib/status";

type Proposal = {
  id: string;
  row: string;
  column: string;
  cell: FoundCell;
  current: Cell;
  note: string | null;
  check: string;
  status: "open" | "accepted" | "rejected";
  via: "site" | "agent";
  author: string;
  created_at: string;
};

type Change = { id: string; row: string; column: string; cell: FoundCell; previous: Cell; author: string; created_at: string };

const shown = (cell: Cell) => ("missing" in cell ? "Not stated" : display(cell.value));

const Empty = ({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) => (
  <div className="rounded-xl border py-14 text-center">
    <Icon className="mx-auto size-6 text-muted-foreground" />
    <p className="mt-3 font-medium">{title}</p>
    <p className="mx-auto mt-1 max-w-sm px-4 text-sm text-muted-foreground">{body}</p>
  </div>
);

/** Old value to new, the shape every change takes. */
const Diff = ({ from, to }: { from: Cell; to: Cell }) => (
  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm">
    <span className="text-muted-foreground line-through">{shown(from)}</span>
    <ArrowRight className="size-3.5 text-muted-foreground" />
    <span className="font-medium">{shown(to)}</span>
  </p>
);

const Proof = ({ cell }: { cell: FoundCell }) => (
  <div className="mt-2 space-y-1 text-sm">
    <blockquote className="border-l-2 pl-3 break-words text-muted-foreground">{cell.quote}</blockquote>
    <a href={cell.source} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
      {host(cell.source)}
      <ExternalLink className="size-3" />
    </a>
  </div>
);

const columnLabel = (table: PublishedTable, id: string) => table.columns.find((column) => column.id === id)?.label ?? id;

function ProposalCard({ proposal, table, canDecide, onDecided }: { proposal: Proposal; table: PublishedTable; canDecide: boolean; onDecided: () => void }) {
  const [error, setError] = useState<string>();
  const decide = async (action: "accept" | "reject") => {
    const { ok, data } = await postJson<{ error?: string }>(`/api/proposals/${proposal.id}/${action}`);
    if (ok) onDecided();
    else setError(data.error ?? "That didn't work. Try again.");
  };
  const CheckIcon = proposal.check === "found" ? CircleCheck : CircleHelp;
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{proposal.row} · {columnLabel(table, proposal.column)}</p>
          <Diff from={proposal.current} to={proposal.cell} />
        </div>
        <Badge variant={proposal.status === "open" ? "secondary" : "outline"} className="capitalize">{proposal.status}</Badge>
      </div>
      <Proof cell={proposal.cell} />
      {proposal.note && <p className="mt-2 text-sm">{proposal.note}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <CheckIcon className="size-3.5" />
          {proposal.check === "found" ? "Quote found on the page" : "Couldn't read the page"}
        </span>
        <span className="flex items-center gap-1">
          {proposal.via === "agent" && <Bot className="size-3.5" />}
          {proposal.author}{proposal.via === "agent" ? "'s agent" : ""}, {day(proposal.created_at.slice(0, 10))}
        </span>
      </div>
      {canDecide && proposal.status === "open" && (
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" onClick={() => decide("accept")}>Accept</Button>
          <Button size="sm" variant="outline" onClick={() => decide("reject")}>Reject</Button>
          {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
        </div>
      )}
    </li>
  );
}

export function ProposalsTab({ table, canDecide }: { table: PublishedTable; canDecide: boolean }) {
  const { data, status, retry } = useJson<Proposal[]>(`/api/tables/${table.owner}/${table.slug}/proposals`);
  if (status === "failed") return <Empty icon={GitPullRequestArrow} title="Proposals didn't load" body="Try this page again in a moment." />;
  if (!data?.length) {
    return <Empty icon={GitPullRequestArrow} title="No proposals yet" body="Open the sheet, select a cell and suggest a change. Each proposal carries its source and quote." />;
  }
  return <ul className="divide-y rounded-xl border">{data.map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} table={table} canDecide={canDecide} onDecided={retry} />)}</ul>;
}

export function HistoryTab({ table }: { table: PublishedTable }) {
  const { data, status } = useJson<Change[]>(`/api/tables/${table.owner}/${table.slug}/history`);
  if (status === "failed") return <Empty icon={History} title="History didn't load" body="Try this page again in a moment." />;
  if (!data?.length) return <Empty icon={History} title="No changes yet" body="When a value changes, you'll see what it said before, who changed it and the new proof." />;
  return (
    <ul className="divide-y rounded-xl border">
      {data.map((change) => (
        <li key={change.id} className="px-4 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium">{change.row} · {columnLabel(table, change.column)}</p>
            <p className="text-xs text-muted-foreground">{change.author}, {day(change.created_at.slice(0, 10))}</p>
          </div>
          <Diff from={change.previous} to={change.cell} />
          <Proof cell={change.cell} />
        </li>
      ))}
    </ul>
  );
}
