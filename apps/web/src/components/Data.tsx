import type { ColumnSummary } from "@skeleton/tables/columns";
import type { Column } from "@skeleton/tables/format";
import { Check, Copy, GitFork, History } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";
import { Field, FormError } from "@/components/Layout";
import { Spinner } from "@/components/Loading";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { postJson, sendJson, useMe } from "@/lib/api";
import { day, display } from "@/lib/cells";
import { copyText } from "@/lib/copy";
import { statuses, type PublishedTable } from "@/lib/status";
import { signInHref } from "@/lib/account";

/** One line to copy, with its button. */
function CopyLine({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!(await copyText(text))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex min-w-0 items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border bg-muted px-2 py-1.5 text-xs" title={text}>{text}</code>
        <Button type="button" variant="outline" size="icon-sm" aria-label={`Copy ${label}`} onClick={() => void copy()}>{copied ? <Check /> : <Copy />}</Button>
      </div>
    </div>
  );
}

type DataLink = { url: string | null; pandas?: string; sheets?: string };

/**
 * Where a notebook, a script or a spreadsheet loads the table from. A public table has a lasting
 * address. A private one gets a link with a secret in it, which its people can replace or turn off.
 */
export function DataLinkDialog({ table, onClose }: { table: PublishedTable; onClose: () => void }) {
  const api = `/api/tables/${table.owner}/${table.slug}/data-link`;
  const publicUrl = !table.private && !table.draft ? `${location.origin}/data/${table.owner}/${table.slug}.csv` : undefined;
  const [link, setLink] = useState<DataLink>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void fetch(api)
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as DataLink & { error?: string };
        if (response.ok) setLink(data);
        else setError(data.error ?? "That didn't load.");
      })
      .catch(() => setError("Couldn't connect. Try again."));
  }, [api]);
  const run = async (method: string, body?: unknown) => {
    setBusy(true);
    const { ok, data } = await sendJson<DataLink & { error?: string }>(method, api, body);
    setBusy(false);
    if (!ok) return setError(data.error ?? "That didn't save.");
    setError(undefined);
    setLink(data);
  };
  const columns = table.columns.map((column) => column.id).join(",");
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogTitle>Use this table in code</DialogTitle>
        <DialogDescription>Load it straight into a notebook, a script or a spreadsheet. It always gives the table as it is now.</DialogDescription>
        <div className="min-w-0 space-y-4 text-sm">
          {publicUrl && (
            <div className="space-y-2">
              <p className="font-medium">Public address</p>
              <CopyLine label="CSV" text={publicUrl} />
              <CopyLine label="Python (pandas)" text={`pd.read_csv("${publicUrl}?proof=0")`} />
            </div>
          )}
          <div className="space-y-2">
            <p className="font-medium">{publicUrl ? "Private link" : "Data link"}</p>
            <p className="text-muted-foreground">Anyone with this link can read the data, without signing in. Making a new one stops the old one working.</p>
            {!link ? (
              error ? null : <Spinner label="Loading the data link" />
            ) : link.url ? (
              <>
                <CopyLine label="CSV" text={link.url} />
                <CopyLine label="Python (pandas)" text={link.pandas!} />
                <CopyLine label="Google Sheets" text={link.sheets!} />
                <p className="text-xs text-muted-foreground">Add <code>?columns={columns}</code> to pick columns, and <code>&amp;names=0</code> to leave out row names.</p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void run("POST", { fresh: true })}>Make a new link</Button>
                  <Button type="button" variant="ghost" size="sm" disabled={busy} className="text-destructive" onClick={() => void run("DELETE")}>Turn off</Button>
                </div>
              </>
            ) : (
              <Button type="button" size="sm" disabled={busy} aria-busy={busy} onClick={() => void run("POST")}>{busy && <Spinner label="Making the link" />}Make a data link</Button>
            )}
            <FormError error={error} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Freeze the table as it is, so a result can say exactly what it used. */
export function SaveVersionDialog({ table, onClose, onSaved }: { table: PublishedTable; onClose: () => void; onSaved: () => void }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [, navigate] = useLocation();
  const save = async (event: FormEvent) => {
    event.preventDefault();
    const { ok, data } = await postJson<{ number?: number; error?: string }>(`/api/tables/${table.owner}/${table.slug}/versions`, { note });
    if (!ok) return setError(data.error ?? "That didn't save.");
    toast.success(`Saved version ${data.number}`, { action: { label: "Open", onClick: () => navigate(`/${table.owner}/${table.slug}/v/${data.number}`) } });
    onSaved();
    onClose();
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogTitle>Save a version</DialogTitle>
        <DialogDescription>Freezes the table's {table.rows.length} rows as they are now, with a link that never changes. The table carries on as usual.</DialogDescription>
        <form onSubmit={(event) => void save(event)} className="min-w-0 space-y-3">
          <Field label="Note (optional)"><Input autoFocus maxLength={200} placeholder="Before review" value={note} onChange={(event) => setNote(event.target.value)} /></Field>
          <FormError error={error} />
          <Button type="submit" size="sm">Save version</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A table's saved versions, newest first. */
export function VersionList({ table }: { table: PublishedTable }) {
  if (!table.versions?.length) return <p className="text-sm text-muted-foreground">None saved yet.</p>;
  return (
    <ul className="space-y-1.5 text-sm">
      {[...table.versions].reverse().slice(0, 8).map((version) => (
        <li key={version.number}>
          <Link href={`/${table.owner}/${table.slug}/v/${version.number}`} className="flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground">
            <History className="size-3.5 shrink-0" />
            <span className="font-medium text-foreground">v{version.number}</span>
            <span className="min-w-0 truncate">{version.note || `${version.rows} rows`}</span>
            <span className="ml-auto shrink-0 text-xs tabular-nums">{day(version.created).replace(/, \d{4}$/, "")}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Copy a table into your own account, as a private draft. */
export function ForkButton({ table, size = "lg" }: { table: PublishedTable; size?: "lg" | "sm" }) {
  const { user, canSignIn } = useMe();
  const [, navigate] = useLocation();
  const [busy, setBusy] = useState(false);
  if (!canSignIn) return null;
  if (!user) return <Button variant="outline" size={size} asChild><a href={signInHref()}><GitFork />Fork</a></Button>;
  const fork = async () => {
    setBusy(true);
    const { ok, data } = await postJson<{ owner?: string; slug?: string; error?: string }>(`/api/tables/${table.owner}/${table.slug}/fork`);
    setBusy(false);
    if (!ok) return void toast.error(data.error ?? "That didn't copy.");
    toast.success("Forked into your account as a private draft");
    navigate(`/${data.owner}/${data.slug}/sheet`);
  };
  return <Button variant="outline" size={size} disabled={busy} aria-busy={busy} onClick={() => void fork()} title="Copy this table into your account to extend or relabel it">{busy ? <Spinner label="Forking" /> : <GitFork />}Fork</Button>;
}

/** Where a fork came from, linked. */
export const ForkedFrom = ({ table }: { table: PublishedTable }) =>
  table.forkedFrom ? <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground"><GitFork className="size-3.5" />Forked from <Link href={`/${table.forkedFrom}`} className="underline underline-offset-2 hover:text-foreground">{table.forkedFrom}</Link></p> : null;

const originLabels: Record<string, string> = { quote: "quoted", link: "linked", generated: "generated", entered: "entered", imported: "imported" };

/** What one column holds, small enough to sit under its heading. */
export function ColumnSummaryView({ summary, column, compact = false }: { summary: ColumnSummary; column: Column; compact?: boolean }) {
  const origins = Object.entries(summary.origins).map(([origin, count]) => `${count} ${originLabels[origin] ?? origin}`).join(" · ");
  const blank = summary.blank ? `${summary.blank} blank` : "";
  const facts = (() => {
    switch (summary.kind) {
      case "categories": {
        const top = summary.values[0]!.count;
        const shown = summary.values.slice(0, compact ? 4 : 10);
        return (
          <ul className="space-y-0.5" aria-label={`Values in ${column.label}`}>
            {shown.map(({ value, count }) => (
              <li key={value} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2" title={`${value}: ${count}`}>
                <span className="relative block h-4 overflow-hidden rounded-sm bg-muted">
                  <span className={`absolute inset-y-0 left-0 ${statuses.generated.tint}`} style={{ width: `${(count / top) * 100}%` }} />
                  <span className="relative truncate px-1 text-[11px] leading-4">{value}</span>
                </span>
                <span className="text-[11px] tabular-nums text-muted-foreground">{count}</span>
              </li>
            ))}
            {summary.values.length > shown.length && <li className="text-[11px] text-muted-foreground">+{summary.values.length - shown.length} more</li>}
          </ul>
        );
      }
      case "text":
        return <p>{summary.shortest === summary.longest ? `${summary.longest} characters` : `${summary.shortest}–${summary.longest} characters, about ${summary.average}`}{summary.duplicates ? ` · ${summary.duplicates} repeated` : ""}</p>;
      case "number": {
        const peak = Math.max(...summary.histogram);
        return (
          <div className="space-y-1">
            <div className="flex h-6 items-end gap-0.5 border-b border-border" aria-hidden="true">
              {summary.histogram.map((count, index) => (
                <span key={index} className="flex h-full flex-1 items-end rounded-t-sm bg-muted">
                  <span className={`w-full rounded-t-sm ${statuses.generated.solid}`} style={{ height: `${peak ? Math.max((count / peak) * 100, count ? 12 : 0) : 0}%` }} />
                </span>
              ))}
            </div>
            <p className="tabular-nums">{display(summary.min)}–{display(summary.max)}{column.unit ? ` ${column.unit}` : ""}, middle {display(summary.median)}</p>
          </div>
        );
      }
      case "boolean":
        return <p className="tabular-nums">{summary.yes} yes · {summary.no} no</p>;
      case "date":
        return <p className="tabular-nums">{summary.earliest === summary.latest ? day(summary.earliest) : `${day(summary.earliest)} – ${day(summary.latest)}`}{summary.months.length > 1 ? ` · busiest ${new Date(`${[...summary.months].sort((a, b) => b.count - a.count)[0]!.month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })}` : ""}</p>;
      default:
        return <p>No values yet</p>;
    }
  })();
  return (
    <div className="min-w-0 space-y-1 text-xs text-muted-foreground">
      {facts}
      {!compact && (origins || blank) && <p>{[origins, blank].filter(Boolean).join(" · ")}</p>}
    </div>
  );
}
