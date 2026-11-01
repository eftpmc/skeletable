import type { Cell, FoundCell } from "@skeleton/tables/format";
import { ArrowRight, Bot, CircleCheck, CircleHelp, ExternalLink, GitPullRequestArrow, History } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";
import { EmptyState, List, LoadFailed, LoadingList, PageHeader } from "@/components/Layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ownsAccount } from "@/lib/account";
import { postJson, useJson, useMe } from "@/lib/api";
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
  const { user } = useMe();
  const [error, setError] = useState<string>();
  const decide = async (action: "accept" | "reject" | "block") => {
    const { ok, data } = await postJson<{ error?: string }>(`/api/proposals/${proposal.id}/${action}`);
    if (!ok) return setError(data.error ?? "That didn't work. Try again.");
    toast.success({ accept: "Proposal accepted", reject: "Proposal rejected", block: "Person blocked" }[action]);
    onDecided();
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
          {ownsAccount(user, "skeletable") && <Button size="sm" variant="ghost" onClick={() => decide("block")}>Block person</Button>}
          {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
        </div>
      )}
    </li>
  );
}

const Heading = ({ title, count, href }: { title: string; count?: number; href?: string }) => (
  <div className="mb-3 flex items-center justify-between gap-3">
    <h2 className="font-medium">{title}{count ? <Badge variant="secondary" className="ml-2 px-1.5">{count}</Badge> : null}</h2>
    {href && <Link href={href} className="text-sm text-muted-foreground hover:text-foreground hover:underline">View all</Link>}
  </div>
);

const ChangeRow = ({ change, table }: { change: Change; table: PublishedTable }) => (
  <li className="px-4 py-3">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <p className="text-sm font-medium">{change.row} · {columnLabel(table, change.column)}</p>
      <p className="text-xs text-muted-foreground">{change.author}, {day(change.created_at.slice(0, 10))}</p>
    </div>
    <Diff from={change.previous} to={change.cell} />
    <Proof cell={change.cell} />
  </li>
);

/** Recent proposals and changes, on the table's own page. */
export function Activity({ table, canDecide }: { table: PublishedTable; canDecide: boolean }) {
  const base = `/${table.owner}/${table.slug}`;
  const proposals = useJson<Proposal[]>(`/api/tables/${table.owner}/${table.slug}/proposals`);
  const history = useJson<Change[]>(`/api/tables/${table.owner}/${table.slug}/history`);
  const open = proposals.data?.filter((proposal) => proposal.status === "open") ?? [];
  const changes = history.data ?? [];
  if (proposals.status === "failed" || history.status === "failed") {
    return (
      <section>
        <Heading title="Activity" />
        <LoadFailed what="Activity" retry={() => { proposals.retry(); history.retry(); }} />
      </section>
    );
  }
  if (!proposals.data || !history.data) {
    return (
      <section>
        <Heading title="Activity" />
        <LoadingList rows={2} label="Loading activity" />
      </section>
    );
  }
  if (!open.length && !changes.length) {
    return (
      <section>
        <Heading title="Activity" />
        <p className="rounded-xl border px-4 py-6 text-center text-sm text-muted-foreground">No proposals or changes yet. Open the sheet and select a cell to suggest one.</p>
      </section>
    );
  }
  return (
    <div className="space-y-6">
      {open.length > 0 && (
        <section>
          <Heading title="Open proposals" count={open.length} href={`${base}/proposals`} />
          <List>
            {open.slice(0, 3).map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} table={table} canDecide={canDecide} onDecided={() => { proposals.retry(); history.retry(); }} />)}
          </List>
        </section>
      )}
      {changes.length > 0 && (
        <section>
          <Heading title="Recent changes" href={`${base}/history`} />
          <List>{changes.slice(0, 3).map((change) => <ChangeRow key={change.id} change={change} table={table} />)}</List>
        </section>
      )}
    </div>
  );
}

export function AllProposals({ table, canDecide }: { table: PublishedTable; canDecide: boolean }) {
  const { data, status, retry } = useJson<Proposal[]>(`/api/tables/${table.owner}/${table.slug}/proposals`);
  return (
    <>
      <PageHeader title="Proposals" />
      {status === "failed" ? (
        <LoadFailed what="Proposals" retry={retry} />
      ) : !data ? (
        <LoadingList label="Loading proposals" />
      ) : data.length ? (
        <List>{data.map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} table={table} canDecide={canDecide} onDecided={retry} />)}</List>
      ) : (
        <EmptyState icon={GitPullRequestArrow} title="No proposals yet" body="Open the sheet, select a cell and suggest a change. Each proposal carries its source and quote." />
      )}
    </>
  );
}

export function AllChanges({ table }: { table: PublishedTable }) {
  const { data, status, retry } = useJson<Change[]>(`/api/tables/${table.owner}/${table.slug}/history`);
  return (
    <>
      <PageHeader title="History" />
      {status === "failed" ? (
        <LoadFailed what="History" retry={retry} />
      ) : !data ? (
        <LoadingList label="Loading history" />
      ) : data.length ? (
        <List>{data.map((change) => <ChangeRow key={change.id} change={change} table={table} />)}</List>
      ) : (
        <EmptyState icon={History} title="No changes yet" body="When a value changes, you'll see what it said before, who changed it and the new proof." />
      )}
    </>
  );
}
