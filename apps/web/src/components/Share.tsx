import { Check, Copy, Globe, Lock, Share2, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ownsAccount } from "@/lib/account";
import { postJson, sendJson, useJson, useMe } from "@/lib/api";
import type { PublishedTable } from "@/lib/status";

type Access = { private: boolean; people: { id: string; email: string }[] };

const notes = {
  public: "Public: anyone with the link can view, and it shows up in Browse.",
  private: "Private: only people on this account and those you add can view.",
};

const Line = ({ isPrivate }: { isPrivate?: boolean }) => {
  const Icon = isPrivate ? Lock : Globe;
  return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Icon className="size-4 shrink-0" />{notes[isPrivate ? "private" : "public"]}</p>;
};

/** Public or private, and who's been added, for the people who own the table. */
function ManageAccess({ table, onChanged }: { table: PublishedTable; onChanged: () => void }) {
  const base = `/api/tables/${table.owner}/${table.slug}`;
  const { data, status, retry } = useJson<Access>(`${base}/access`);
  const [email, setEmail] = useState("");
  const [goingPublic, setGoingPublic] = useState(false);
  const [error, setError] = useState<string>();

  const choose = async (next: boolean) => {
    setGoingPublic(false);
    const { ok, data: result } = await sendJson<{ error?: string }>("PATCH", `${base}/access`, { private: next });
    if (!ok) return setError(result.error ?? "That didn't save.");
    setError(undefined);
    retry();
    onChanged();
  };
  const add = async (event: FormEvent) => {
    event.preventDefault();
    const { ok, data: result } = await postJson<{ error?: string }>(`${base}/people`, { email });
    if (!ok) return setError(result.error ?? "That didn't save.");
    setEmail("");
    setError(undefined);
    retry();
  };
  const remove = async (id: string) => {
    await sendJson("DELETE", `${base}/people/${id}`);
    retry();
  };

  if (status === "failed" && !data) return <p role="alert" className="text-sm text-destructive">Who can see this didn't load.</p>;
  if (!data) return <Line isPrivate={table.private} />;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Who can see this table">
        <Button variant={data.private ? "outline" : "default"} aria-pressed={!data.private} onClick={() => (data.private ? setGoingPublic(true) : undefined)}><Globe />Public</Button>
        <Button variant={data.private ? "default" : "outline"} aria-pressed={data.private} onClick={() => !data.private && choose(true)}><Lock />Private</Button>
      </div>
      {goingPublic ? (
        <div className="space-y-2 rounded-lg border p-3 text-sm">
          <p>Anyone will be able to see this table, including search engines and agents.</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => choose(false)}>Make public</Button>
            <Button size="sm" variant="ghost" onClick={() => setGoingPublic(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Line isPrivate={data.private} />
      )}
      {data.private && (
        <>
          <form onSubmit={add} className="flex gap-2">
            <Input type="email" aria-label="Add someone by email" placeholder="Add someone by email" required value={email} onChange={(event) => setEmail(event.target.value)} />
            <Button type="submit" variant="outline">Add</Button>
          </form>
          {data.people.length > 0 && (
            <ul className="divide-y rounded-lg border text-sm">
              {data.people.map((person) => (
                <li key={person.id} className="flex items-center gap-2 py-1 pr-1 pl-3">
                  <span className="min-w-0 flex-1 truncate">{person.email}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">Can view</span>
                  <Button variant="ghost" size="icon-sm" aria-label={`Remove ${person.email}`} onClick={() => remove(person.id)}><Trash2 /></Button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">They open it by signing in with Google using that address. They can also suggest changes.</p>
        </>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

/** A link to the live table as you're looking at it, and for its owners, who can open that link. */
export function ShareButton({ table, path, size = "lg", onChanged }: { table: PublishedTable; path: string; size?: "lg" | "sm"; onChanged: () => void }) {
  const { user } = useMe();
  const url = `${location.origin}${path}`;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // The browser refused; the link is still on screen to select.
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size={size}><Share2 />Share</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="pr-6">Share {table.title}</DialogTitle>
        <DialogDescription>This link opens the live table with your current sort and filters.</DialogDescription>
        <div className="flex items-center gap-2">
          <Input aria-label="Link to this table" readOnly value={url} onFocus={(event) => event.target.select()} />
          <Button variant="outline" className="shrink-0" onClick={copy}>{copied ? <Check /> : <Copy />}{copied ? "Copied" : "Copy link"}</Button>
        </div>
        {ownsAccount(user, table.owner) ? <ManageAccess table={table} onChanged={onChanged} /> : <Line isPrivate={table.private} />}
      </DialogContent>
    </Dialog>
  );
}
