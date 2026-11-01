import { Check, Copy, KeyRound, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { Page } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { postJson, sendJson, useJson, useMe } from "@/lib/api";
import { day } from "@/lib/cells";
import { Message } from "@/pages/Message";

type Token = { id: string; name: string; created_at: string; last_used_at: string | null };

function Profile({ handle, name }: { handle: string; name: string }) {
  const [form, setForm] = useState({ handle, name });
  const [note, setNote] = useState<string>();
  const save = async (event: FormEvent) => {
    event.preventDefault();
    const response = await fetch("/api/me", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
    const data = (await response.json()) as { error?: string };
    if (response.ok) location.reload();
    else setNote(data.error ?? "That didn't save.");
  };
  return (
    <section className="space-y-3">
      <h2 className="font-medium">Your profile</h2>
      <form onSubmit={save} className="space-y-3">
        <label className="block text-sm font-medium">Name<Input className="mt-1.5 font-normal" required maxLength={80} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label className="block text-sm font-medium">Public name<Input className="mt-1.5 font-normal" required maxLength={39} value={form.handle} onChange={(event) => setForm({ ...form, handle: event.target.value.toLowerCase() })} /></label>
        <p className="text-xs text-muted-foreground">Your tables live at <Link href={`/${handle}`} className="underline">skeletable.com/{handle}</Link>. Changing this changes their addresses.</p>
        <div className="flex items-center gap-3">
          <Button type="submit" variant="outline">Save</Button>
          {note && <span role="alert" className="text-sm text-destructive">{note}</span>}
        </div>
      </form>
    </section>
  );
}

function EmailUpdates({ enabled }: { enabled: boolean }) {
  const [on, setOn] = useState(enabled);
  const change = async (next: boolean) => {
    setOn(next);
    await fetch("/api/me", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ emailUpdates: next }) });
  };
  return (
    <section className="space-y-2 border-t pt-5">
      <h2 className="font-medium">Email</h2>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4 accent-green-600" checked={on} onChange={(event) => change(event.target.checked)} />
        Email me when someone proposes a change to my tables
      </label>
    </section>
  );
}

function DeleteAccount() {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const remove = async () => {
    const { ok, data } = await sendJson<{ error?: string }>("DELETE", "/api/me");
    if (ok) location.href = "/";
    else setError(data.error ?? "That didn't delete.");
  };
  return (
    <section className="space-y-2 border-t pt-5">
      <h2 className="font-medium">Delete your account</h2>
      <p className="text-sm text-muted-foreground">This removes your email, tokens and tables for good. Proposals you made to other people's tables stay, with your name removed.</p>
      {confirming ? (
        <div className="flex gap-2">
          <Button variant="destructive" onClick={remove}>Delete everything</Button>
          <Button variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
        </div>
      ) : (
        <Button variant="outline" onClick={() => setConfirming(true)}>Delete account</Button>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </section>
  );
}

function NewToken({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const command = `claude mcp add --transport http skeletable ${location.origin}/mcp --header "Authorization: Bearer ${token}"`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
    } catch {
      // The browser refused; the command is still on screen to select.
    }
  };
  return (
    <div className="space-y-2 rounded-xl border p-4 text-sm">
      <p className="font-medium">Copy this now. It won't be shown again.</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 rounded-md bg-muted px-2 py-1.5 font-mono text-xs break-all">{command}</code>
        <Button variant="outline" size="icon-sm" onClick={copy} aria-label={copied ? "Copied" : "Copy command"}>
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
    </div>
  );
}

/** Your own settings: for now, the tokens that let your agents propose changes. */
export function Settings() {
  const { user } = useMe();
  const { data, retry } = useJson<Token[]>("/api/tokens");
  const [name, setName] = useState("");
  const [created, setCreated] = useState<string>();

  useEffect(() => {
    document.title = "Settings · Skeletable";
  }, []);

  if (!user) {
    return (
      <Page>
        <main className="px-4"><Message title="Sign in to see your settings" /></main>
      </Page>
    );
  }

  const create = async (event: FormEvent) => {
    event.preventDefault();
    const { ok, data: token } = await postJson<{ token: string }>("/api/tokens", { name });
    if (!ok) return;
    setCreated(token.token);
    setName("");
    retry();
  };

  const remove = async (id: string) => {
    await fetch(`/api/tokens/${id}`, { method: "DELETE" });
    retry();
  };

  return (
    <Page>
      <main className="mx-auto max-w-2xl space-y-5 px-4 pt-8 pb-16 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        {user.handle && <Profile handle={user.handle} name={user.name ?? user.handle} />}
        <EmailUpdates enabled={user.emailUpdates} />
        <section className="space-y-3 border-t pt-5">
          <div>
            <h2 className="font-medium">Agent tokens</h2>
            <p className="text-sm text-muted-foreground">Reading public tables needs no token. A token lets an agent read every private table you can, and propose changes in your name, which owners still approve. Treat it like a password.</p>
          </div>
          <form onSubmit={create} className="flex gap-2">
            <Input aria-label="Token name" placeholder="Name it, like Laptop" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} />
            <Button type="submit" variant="outline">Create token</Button>
          </form>
          {created && <NewToken token={created} />}
          {data?.length ? (
            <ul className="divide-y rounded-xl border text-sm">
              {data.map((token) => (
                <li key={token.id} className="flex items-center gap-3 px-3 py-2">
                  <KeyRound className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{token.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Created {day(token.created_at.slice(0, 10))} · {token.last_used_at ? `Last used ${day(token.last_used_at.slice(0, 10))}` : "Never used"}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon-sm" onClick={() => remove(token.id)} aria-label={`Delete ${token.name}`}><Trash2 /></Button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
        <DeleteAccount />
      </main>
    </Page>
  );
}
