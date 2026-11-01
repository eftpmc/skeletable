import { Check, Copy, KeyRound, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Link } from "wouter";
import { ConfirmButton, EmptyState, Field, FormError, List, LoadFailed, LoadingList, Section } from "@/components/Layout";
import { SettingsLayout } from "@/components/SettingsLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { postJson, sendJson, useJson, useMe } from "@/lib/api";
import { day } from "@/lib/cells";
import { copyText } from "@/lib/copy";

type Token = { id: string; name: string; created_at: string; last_used_at: string | null };

function ProfileForm({ handle, name, bio }: { handle: string; name: string; bio: string }) {
  const { refresh } = useMe();
  const [form, setForm] = useState({ handle, name, bio });
  const [error, setError] = useState<string>();
  const save = async (event: FormEvent) => {
    event.preventDefault();
    const { ok, data } = await sendJson<{ error?: string }>("PATCH", "/api/me", form);
    if (!ok) return setError(data.error ?? "That didn't save.");
    setError(undefined);
    toast.success("Profile saved");
    refresh();
  };
  return (
    <form onSubmit={save} className="space-y-4">
      <Field label="Name"><Input required maxLength={80} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
      <Field label="Public name" hint={<>Your tables live at <Link href={`/${handle}`} className="underline">skeletable.com/{handle}</Link>. Changing this changes their addresses.</>}>
        <Input required maxLength={39} value={form.handle} onChange={(event) => setForm({ ...form, handle: event.target.value.toLowerCase() })} />
      </Field>
      <Field label="Description" hint="Shown on your public page."><Input maxLength={160} value={form.bio} onChange={(event) => setForm({ ...form, bio: event.target.value })} /></Field>
      <FormError error={error} />
      <Button type="submit" variant="outline">Save</Button>
    </form>
  );
}

function EmailUpdates({ enabled }: { enabled: boolean }) {
  const [on, setOn] = useState(enabled);
  const change = async (next: boolean) => {
    setOn(next);
    const { ok } = await sendJson("PATCH", "/api/me", { emailUpdates: next });
    if (ok) return void toast.success(next ? "Emails on" : "Emails off");
    setOn(!next);
    toast.error("That didn't save");
  };
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" className="size-4 accent-green-600" checked={on} onChange={(event) => change(event.target.checked)} />
      Email me when someone proposes a change to my tables
    </label>
  );
}

export function ProfileSettings() {
  const { user } = useMe();
  const { data } = useJson<{ bio: string }>("/api/me/profile");
  return (
    <SettingsLayout title="Settings">
      <Section title="Your profile">
        {user?.handle && data ? <ProfileForm handle={user.handle} name={user.name ?? user.handle} bio={data.bio} /> : <LoadingList rows={3} label="Loading your profile" />}
      </Section>
      <Section title="Email">{user && <EmailUpdates enabled={user.emailUpdates} />}</Section>
    </SettingsLayout>
  );
}

function NewToken({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const command = `claude mcp add --transport http skeletable ${location.origin}/mcp --header "Authorization: Bearer ${token}"`;
  return (
    <div className="space-y-2 rounded-xl border p-4 text-sm">
      <p className="font-medium">Copy this now. It won't be shown again.</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 rounded-md bg-muted px-2 py-1.5 font-mono text-xs break-all">{command}</code>
        <Button variant="outline" size="icon-sm" onClick={async () => setCopied(await copyText(command))} aria-label={copied ? "Copied" : "Copy command"}>
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
    </div>
  );
}

export function TokenSettings() {
  const { data, status, retry } = useJson<Token[]>("/api/tokens");
  const [name, setName] = useState("");
  const [created, setCreated] = useState<string>();

  const create = async (event: FormEvent) => {
    event.preventDefault();
    const { ok, data: token } = await postJson<{ token: string }>("/api/tokens", { name });
    if (!ok) return void toast.error("That didn't create a token");
    setCreated(token.token);
    setName("");
    retry();
  };

  const remove = async (id: string) => {
    const { ok } = await sendJson("DELETE", `/api/tokens/${id}`);
    if (ok) toast.success("Token deleted");
    else toast.error("That didn't delete");
    retry();
  };

  return (
    <SettingsLayout title="Agent tokens">
      <Section title="Agent tokens" description="Reading public tables needs no token. A token lets an agent read every private table you can, and propose changes in your name, which owners still approve. Treat it like a password.">
        <form onSubmit={create} className="flex gap-2">
          <Input aria-label="Token name" placeholder="Name it, like Laptop" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} />
          <Button type="submit" variant="outline">Create token</Button>
        </form>
        {created && <NewToken token={created} />}
        {status === "failed" ? (
          <LoadFailed what="Your tokens" retry={retry} />
        ) : !data ? (
          <LoadingList rows={2} label="Loading your tokens" />
        ) : data.length ? (
          <List label="Your tokens">
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
          </List>
        ) : (
          <EmptyState icon={KeyRound} title="No tokens yet" body="Make one to connect an agent that can see your private tables or propose changes." />
        )}
      </Section>
    </SettingsLayout>
  );
}

export function AccountSettings() {
  const { user } = useMe();
  const [error, setError] = useState<string>();
  const remove = async () => {
    const { ok, data } = await sendJson<{ error?: string }>("DELETE", "/api/me");
    if (ok) location.href = "/";
    else setError(data.error ?? "That didn't delete.");
  };
  return (
    <SettingsLayout title="Account">
      <Section title="Signed in with Google"><p className="text-sm text-muted-foreground">{user?.email}</p></Section>
      <Section title="Delete your account" description="This removes your email, tokens and tables for good. Proposals you made to other people's tables stay, with your name removed.">
        <ConfirmButton label="Delete account" confirm="Delete everything" onConfirm={remove} />
        <FormError error={error} />
      </Section>
    </SettingsLayout>
  );
}
