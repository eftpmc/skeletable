import type { Cell, FoundCell } from "@skeleton/tables/format";
import { ArrowRight, Bot, CircleCheck, CircleHelp, ExternalLink, GitPullRequestArrow, History } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";
import { ProposalComposer } from "@/components/ProposalComposer";
import { Spinner } from "@/components/Loading";
import { EmptyState, List, LoadFailed, LoadingList, PageHeader } from "@/components/Layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ownsAccount } from "@/lib/account";
import { postJson, useJson, useMe } from "@/lib/api";
import { emptyLabel } from "@skeleton/tables/share";
import { day, display, host } from "@/lib/cells";
import type { PublishedTable } from "@/lib/status";

type Proposal = {
  id: string;
  bundle_id?: string;
  title?: string;
  base_cell?: Cell;
  stale?: boolean;
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

function groupProposals(proposals: Proposal[]) {
  const groups = new Map<string, Proposal[]>();
  for (const proposal of proposals) {
    const key = proposal.bundle_id ?? proposal.id;
    groups.set(key, [...(groups.get(key) ?? []), proposal]);
  }
  return [...groups.values()];
}

type Change = { id: string; row: string; column: string; cell: Cell; previous: Cell; author: string; created_at: string };

const shown = (cell: Cell) => ("missing" in cell ? emptyLabel(cell) : display(cell.value));

/** Old value to new, the shape every change takes. */
const Diff = ({ from, to }: { from: Cell; to: Cell }) => (
  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm">
    <span className="text-muted-foreground line-through">{shown(from)}</span>
    <ArrowRight className="size-3.5 text-muted-foreground" />
    <span className="font-medium">{shown(to)}</span>
  </p>
);

const Proof = ({ cell }: { cell: Cell }) => "missing" in cell ? (
  <div className="mt-2 space-y-2 text-sm">
    <p className="text-muted-foreground">{cell.unproven !== undefined ? "Value awaiting proof" : emptyLabel(cell)}</p>
    {cell.checked.length > 0 ? <div className="flex flex-wrap gap-3" aria-label="Sources checked">{cell.checked.map((url) => <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">{host(url)}<ExternalLink className="size-3" /></a>)}</div> : <p className="text-xs text-muted-foreground">No sources checked yet.</p>}
  </div>
) : (
  <div className="mt-2 space-y-1 text-sm">
    <blockquote className="border-l-2 pl-3 break-words text-muted-foreground">{cell.quote}</blockquote>
    <a href={cell.source} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
      {host(cell.source)}
      <ExternalLink className="size-3" />
    </a>
  </div>
);

const columnLabel = (table: PublishedTable, id: string) => table.columns.find((column) => column.id === id)?.label ?? id;

function ProposalCard({ proposal, changes = [proposal], table, canDecide, onDecided }: { proposal: Proposal; changes?: Proposal[]; table: PublishedTable; canDecide: boolean; onDecided: () => void }) {
  const { user } = useMe();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const stale = changes.some((change) => change.stale || change.status !== "open");
  const decide = async (action: "accept" | "reject" | "block") => {
    if (pending) return;
    setPending(true);
    setError(undefined);
    try {
    const { ok, data } = await postJson<{ error?: string }>(`/api/proposals/${proposal.id}/${action}`);
    if (!ok) return setError(data.error ?? "That didn't work. Try again.");
    toast.success({ accept: "Proposal accepted", reject: "Proposal closed", block: "Person blocked" }[action]);
    onDecided();
    } catch { setError("Could not connect. Try again."); }
    finally { setPending(false); }
  };
  const CheckIcon = proposal.check === "found" ? CircleCheck : CircleHelp;
  return (
    <li className="px-2 py-3 sm:px-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{proposal.title ?? `${proposal.row} · ${columnLabel(table, proposal.column)}`}</p>
          <p className="mt-1 text-xs text-muted-foreground">{changes.length} {changes.length === 1 ? "change" : "changes"}</p>
        </div>
        <Badge variant={proposal.status === "open" ? "secondary" : "outline"} className="capitalize">{proposal.status === "rejected" ? "closed" : proposal.status}</Badge>
      </div>
      <div className="mt-3 divide-y overflow-hidden rounded-lg border">
        {changes.map((change) => <div key={change.id} className="p-3">
          <p className="text-sm font-medium">{change.row} · {columnLabel(table, change.column)}</p>
          <Diff from={change.base_cell ?? change.current} to={change.cell} />
          <Proof cell={change.cell} />
          <p className="mt-2 text-xs text-muted-foreground">{change.check === "found" ? "Quote verified on source page" : "Source could not be verified; review it manually"}</p>
          {change.stale && change.status === "open" && <p className="mt-2 text-sm text-destructive">This cell changed after submission. Close this proposal and submit an updated one.</p>}
        </div>)}
      </div>
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
          <Button size="sm" disabled={pending || stale} onClick={() => decide("accept")}>{pending && <Spinner label="Updating proposal" />}Accept {changes.length > 1 ? "all changes" : "change"}</Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => decide("reject")}>Close proposal</Button>
          {ownsAccount(user, "skeletable") && <Button size="sm" variant="ghost" disabled={pending} onClick={() => decide("block")}>Block person</Button>}
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

export const ChangeRow = ({ change, table }: { change: Change; table: PublishedTable }) => (
  <li className="px-2 py-3 sm:px-3">
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
          <Heading title="Open proposals" count={groupProposals(open).length} href={`${base}/proposals`} />
          <List>
            {groupProposals(open).slice(0, 3).map((changes) => <ProposalCard key={changes[0]!.id} proposal={changes.find((change) => change.status === "open") ?? changes[0]!} changes={changes} table={table} canDecide={canDecide} onDecided={() => { proposals.retry(); history.retry(); }} />)}
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
  const [filter, setFilter] = useState("open");
  const groups = groupProposals(data ?? []);
  const visible = groups.filter((changes) => filter === "all" || changes.some((change) => change.status === filter));
  return (
    <>
      <PageHeader title="Proposals" description="Review related changes together, with proof for every value." />
      <ProposalComposer table={table} onCreated={retry} />
      <div className="mb-4 flex gap-2" aria-label="Proposal status">
        {[["open", "Open"], ["accepted", "Accepted"], ["rejected", "Closed"], ["all", "All"]].map(([value, label]) => <Button key={value} size="sm" variant={filter === value ? "secondary" : "ghost"} aria-pressed={filter === value} onClick={() => setFilter(value!)}>{label}</Button>)}
      </div>
      {status === "failed" ? (
        <LoadFailed what="Proposals" retry={retry} />
      ) : !data ? (
        <LoadingList label="Loading proposals" />
      ) : visible.length ? (
        <List>{visible.map((changes) => <ProposalCard key={changes[0]!.id} proposal={changes.find((change) => change.status === "open") ?? changes[0]!} changes={changes} table={table} canDecide={canDecide} onDecided={retry} />)}</List>
      ) : (
        <EmptyState icon={GitPullRequestArrow} title="No proposals in this view" body="Create a proposal to review several related edits together. Every change needs its source and exact quote." />
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
