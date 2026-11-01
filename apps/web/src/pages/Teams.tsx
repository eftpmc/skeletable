import { Trash2, Users } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { Page } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { postJson, sendJson, useJson, useMe, type Team } from "@/lib/api";
import { Message } from "@/pages/Message";

type Role = Team["role"];
type Invite = { id: string; handle: string; name: string; role: Role };
type Member = { id: string; name: string | null; email: string; role: Role };
type TeamDetails = { handle: string; name: string; role: Role; you: string; members: Member[]; invites: { id: string; email: string; role: Role }[] };

const roles: Record<Role, string> = { owner: "Owner", editor: "Editor" };

const selectClass = "h-8 rounded-lg border bg-transparent px-2 text-sm dark:bg-input/30";

const SignedOut = ({ title }: { title: string }) => (
  <Page>
    <main className="px-4"><Message title={title} action={<Button variant="outline" size="sm" asChild><a href="/auth/google">Sign in</a></Button>} /></main>
  </Page>
);

function Invites({ invites, onChanged }: { invites: Invite[]; onChanged: () => void }) {
  const answer = async (id: string, action: "accept" | "decline") => {
    await postJson(`/api/invites/${id}/${action}`);
    onChanged();
  };
  return (
    <section className="space-y-2">
      <h2 className="font-medium">Waiting for you</h2>
      <ul className="divide-y rounded-xl border text-sm">
        {invites.map((invite) => (
          <li key={invite.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
            <span className="min-w-0 flex-1"><span className="font-medium">{invite.name}</span> <span className="text-muted-foreground">invited you as {roles[invite.role].toLowerCase()}</span></span>
            <Button size="sm" onClick={() => answer(invite.id, "accept")}>Join</Button>
            <Button size="sm" variant="ghost" onClick={() => answer(invite.id, "decline")}>Decline</Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The teams you're on, and any waiting for your answer. */
export function Teams() {
  const { user } = useMe();
  const { data: invites } = useJson<Invite[]>("/api/invites");
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();

  useEffect(() => {
    document.title = "Teams · Skeletable";
  }, []);

  if (!user) return <SignedOut title="Sign in to see your teams" />;

  const create = async (event: FormEvent) => {
    event.preventDefault();
    const { ok, data } = await postJson<{ handle: string; error?: string }>("/api/teams", { name });
    if (ok) location.href = `/settings/teams/${data.handle}`;
    else setError(data.error ?? "That didn't save. Try again.");
  };

  return (
    <Page>
      <main className="mx-auto max-w-2xl space-y-6 px-4 pt-8 pb-16 sm:px-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Teams</h1>
          <p className="mt-1 text-muted-foreground">A team has its own page and tables, run by the people on it.</p>
        </div>
        {!!invites?.length && <Invites invites={invites} onChanged={() => location.reload()} />}
        {user.teams.length > 0 && (
          <ul className="divide-y rounded-xl border text-sm">
            {user.teams.map((team) => (
              <li key={team.handle}>
                <Link href={`/settings/teams/${team.handle}`} className="flex items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-muted/50">
                  <Users className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate font-medium">{team.name}</span>
                  <span className="shrink-0 text-muted-foreground">{roles[team.role]}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <section className="space-y-2">
          <h2 className="font-medium">New team</h2>
          <form onSubmit={create} className="flex gap-2">
            <Input aria-label="Team name" placeholder="Team name" required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
            <Button type="submit" variant="outline">Create team</Button>
          </form>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </section>
      </main>
    </Page>
  );
}

function Rename({ team, onError }: { team: TeamDetails; onError: (error: string) => void }) {
  const [name, setName] = useState(team.name);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    const { ok, data } = await sendJson<{ error?: string }>("PATCH", `/api/teams/${team.handle}`, { name });
    if (ok) location.reload();
    else onError(data.error ?? "That didn't save.");
  };
  return (
    <form onSubmit={save} className="space-y-2">
      <label className="block text-sm font-medium">Name<Input className="mt-1.5 font-normal" required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></label>
      <Button type="submit" variant="outline">Save</Button>
    </form>
  );
}

function Members({ team, onChanged, onError }: { team: TeamDetails; onChanged: () => void; onError: (error: string) => void }) {
  const change = async (method: string, id: string, body?: unknown) => {
    const { ok, data } = await sendJson<{ error?: string }>(method, `/api/teams/${team.handle}/members/${id}`, body);
    if (ok) onChanged();
    else onError(data.error ?? "That didn't save.");
  };
  return (
    <ul className="divide-y rounded-xl border text-sm">
      {team.members.map((member) => (
        <li key={member.id} className="flex items-center gap-2 px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{member.name ?? member.email}{member.id === team.you ? " (you)" : ""}</p>
            <p className="truncate text-xs text-muted-foreground">{member.email}</p>
          </div>
          {team.role === "owner" ? (
            <>
              <select aria-label={`Role for ${member.email}`} className={selectClass} value={member.role} onChange={(event) => change("PATCH", member.id, { role: event.target.value })}>
                {Object.entries(roles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              {member.id !== team.you && <Button variant="ghost" size="icon-sm" aria-label={`Remove ${member.email}`} onClick={() => change("DELETE", member.id)}><Trash2 /></Button>}
            </>
          ) : (
            <span className="shrink-0 text-muted-foreground">{roles[member.role]}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function InvitePeople({ team, onChanged, onError }: { team: TeamDetails; onChanged: () => void; onError: (error: string) => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const invite = async (event: FormEvent) => {
    event.preventDefault();
    const { ok, data } = await postJson<{ error?: string }>(`/api/teams/${team.handle}/invites`, { email, role });
    if (!ok) return onError(data.error ?? "That didn't send.");
    setEmail("");
    onChanged();
  };
  const cancel = async (id: string) => {
    await sendJson("DELETE", `/api/teams/${team.handle}/invites/${id}`);
    onChanged();
  };
  return (
    <section className="space-y-2 border-t pt-5">
      <h2 className="font-medium">Invite someone</h2>
      <p className="text-sm text-muted-foreground">They'll see the invite under Teams when they sign in with Google using this address. Editors can change tables. Owners can also manage the team.</p>
      <form onSubmit={invite} className="flex flex-wrap gap-2">
        <Input className="min-w-48 flex-1" type="email" aria-label="Email address" placeholder="name@example.com" required value={email} onChange={(event) => setEmail(event.target.value)} />
        <select aria-label="Role" className={selectClass} value={role} onChange={(event) => setRole(event.target.value as Role)}>
          {Object.entries(roles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <Button type="submit" variant="outline">Invite</Button>
      </form>
      {team.invites.length > 0 && (
        <ul className="divide-y rounded-xl border text-sm">
          {team.invites.map((invite) => (
            <li key={invite.id} className="flex items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1 truncate">{invite.email}</span>
              <span className="shrink-0 text-muted-foreground">{roles[invite.role]}, invited</span>
              <Button variant="ghost" size="icon-sm" aria-label={`Cancel the invite to ${invite.email}`} onClick={() => cancel(invite.id)}><Trash2 /></Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LeaveOrDelete({ team, onError }: { team: TeamDetails; onError: (error: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  const leave = async () => {
    const { ok, data } = await sendJson<{ error?: string }>("DELETE", `/api/teams/${team.handle}/members/${team.you}`);
    if (ok) location.href = "/settings/teams";
    else onError(data.error ?? "That didn't save.");
  };
  const remove = async () => {
    const { ok, data } = await sendJson<{ error?: string }>("DELETE", `/api/teams/${team.handle}`);
    if (ok) location.href = "/settings/teams";
    else onError(data.error ?? "That didn't delete.");
  };
  return (
    <section className="space-y-2 border-t pt-5">
      <Button variant="outline" onClick={leave}>Leave team</Button>
      {team.role === "owner" && (
        <>
          <h2 className="pt-3 font-medium">Delete this team</h2>
          <p className="text-sm text-muted-foreground">This removes the team and every table it owns for good.</p>
          {confirming ? (
            <div className="flex gap-2">
              <Button variant="destructive" onClick={remove}>Delete {team.name}</Button>
              <Button variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
            </div>
          ) : (
            <Button variant="outline" onClick={() => setConfirming(true)}>Delete team</Button>
          )}
        </>
      )}
    </section>
  );
}

/** Who's on a team, and for its owners, how to change that. */
export function TeamSettings({ handle }: { handle: string }) {
  const { user } = useMe();
  const { data: team, status, retry } = useJson<TeamDetails>(`/api/teams/${handle}`);
  const [error, setError] = useState<string>();
  const changed = () => {
    setError(undefined);
    retry();
  };

  useEffect(() => {
    document.title = `${team?.name ?? "Team"} · Skeletable`;
  }, [team?.name]);

  if (!user) return <SignedOut title="Sign in to see this team" />;

  return (
    <Page>
      <main className="mx-auto max-w-2xl space-y-5 px-4 pt-8 pb-16 sm:px-6">
        {status === "missing" ? (
          <Message title="There's no team here" />
        ) : status === "failed" ? (
          <Message title="This team didn't load" action={<Button variant="outline" size="sm" onClick={retry}>Try again</Button>} />
        ) : team ? (
          <>
            <div>
              <Link href="/settings/teams" className="text-sm text-muted-foreground hover:text-foreground hover:underline">Teams</Link>
              <h1 className="text-3xl font-semibold tracking-tight">{team.name}</h1>
              <Link href={`/${team.handle}`} className="text-sm text-muted-foreground hover:text-foreground hover:underline">skeletable.com/{team.handle}</Link>
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            {team.role === "owner" && <Rename key={team.name} team={team} onError={setError} />}
            <section className="space-y-2">
              <h2 className="font-medium">Members</h2>
              <Members team={team} onChanged={changed} onError={setError} />
            </section>
            {team.role === "owner" && <InvitePeople team={team} onChanged={changed} onError={setError} />}
            <LeaveOrDelete team={team} onError={setError} />
          </>
        ) : (
          <div className="space-y-3" aria-label="Loading team">
            <Skeleton className="h-9 w-1/2" />
            <Skeleton className="h-32 rounded-xl" />
          </div>
        )}
      </main>
    </Page>
  );
}
