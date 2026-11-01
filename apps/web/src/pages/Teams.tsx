import { Trash2, Users } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Link } from "wouter";
import { ConfirmButton, EmptyState, Field, FormError, List, LoadFailed, LoadingList, Section } from "@/components/Layout";
import { SettingsLayout } from "@/components/SettingsLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { postJson, sendJson, useJson, useMe, type Team } from "@/lib/api";
import { Message } from "@/pages/Message";

type Role = Team["role"];
type Invite = { id: string; handle: string; name: string; role: Role };
type Member = { id: string; name: string | null; email: string; role: Role };
type TeamDetails = { handle: string; name: string; bio: string; role: Role; you: string; members: Member[]; invites: { id: string; email: string; role: Role }[] };

const roles: Record<Role, string> = { owner: "Owner", editor: "Editor" };

const RoleOptions = () => Object.entries(roles).map(([value, label]) => <option key={value} value={value}>{label}</option>);

function Invites({ invites, onChanged }: { invites: Invite[]; onChanged: () => void }) {
  const answer = async (invite: Invite, action: "accept" | "decline") => {
    const { ok } = await postJson(`/api/invites/${invite.id}/${action}`);
    if (!ok) return void toast.error("That didn't work. Try again.");
    toast.success(action === "accept" ? `You've joined ${invite.name}` : "Invite declined");
    onChanged();
  };
  return (
    <Section title="Waiting for you">
      <List label="Team invites">
        {invites.map((invite) => (
          <li key={invite.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
            <span className="min-w-0 flex-1"><span className="font-medium">{invite.name}</span> <span className="text-muted-foreground">invited you as {roles[invite.role].toLowerCase()}</span></span>
            <Button size="sm" onClick={() => answer(invite, "accept")}>Join</Button>
            <Button size="sm" variant="ghost" onClick={() => answer(invite, "decline")}>Decline</Button>
          </li>
        ))}
      </List>
    </Section>
  );
}

/** The teams you're on, and any waiting for your answer. */
export function Teams() {
  const { user, refresh } = useMe();
  const invites = useJson<Invite[]>("/api/invites");
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();

  const create = async (event: FormEvent) => {
    event.preventDefault();
    const { ok, data } = await postJson<{ handle: string; error?: string }>("/api/teams", { name });
    if (ok) location.href = `/settings/teams/${data.handle}`;
    else setError(data.error ?? "That didn't save. Try again.");
  };

  return (
    <SettingsLayout title="Teams">
      {!!invites.data?.length && <Invites invites={invites.data} onChanged={() => { invites.retry(); refresh(); }} />}
      <Section title="Your teams" description="A team has its own page and tables, run by the people on it.">
        {user?.teams.length ? (
          <List label="Your teams">
            {user.teams.map((team) => (
              <li key={team.handle}>
                <Link href={`/settings/teams/${team.handle}`} className="flex items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-muted/50">
                  <Users className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate font-medium">{team.name}</span>
                  <span className="shrink-0 text-muted-foreground">{roles[team.role]}</span>
                </Link>
              </li>
            ))}
          </List>
        ) : (
          <EmptyState icon={Users} title="No teams yet" body="Make one below to run tables with other people." />
        )}
      </Section>
      <Section title="New team">
        <form onSubmit={create} className="flex gap-2">
          <Input aria-label="Team name" placeholder="Team name" required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
          <Button type="submit" variant="outline">Create team</Button>
        </form>
        <FormError error={error} />
      </Section>
    </SettingsLayout>
  );
}

function TeamProfile({ team, onChanged, onError }: { team: TeamDetails; onChanged: () => void; onError: (error: string) => void }) {
  const [form, setForm] = useState({ name: team.name, bio: team.bio });
  const save = async (event: FormEvent) => {
    event.preventDefault();
    const { ok, data } = await sendJson<{ error?: string }>("PATCH", `/api/teams/${team.handle}`, form);
    if (!ok) return onError(data.error ?? "That didn't save.");
    toast.success("Team saved");
    onChanged();
  };
  return (
    <form onSubmit={save} className="space-y-4">
      <Field label="Name"><Input required maxLength={80} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
      <Field label="Description" hint="Shown on the team's public page."><Input maxLength={160} value={form.bio} onChange={(event) => setForm({ ...form, bio: event.target.value })} /></Field>
      <Button type="submit" variant="outline">Save</Button>
    </form>
  );
}

function Members({ team, onChanged, onError }: { team: TeamDetails; onChanged: () => void; onError: (error: string) => void }) {
  const change = async (method: string, id: string, body?: unknown) => {
    const { ok, data } = await sendJson<{ error?: string }>(method, `/api/teams/${team.handle}/members/${id}`, body);
    if (!ok) return onError(data.error ?? "That didn't save.");
    toast.success(method === "DELETE" ? "Removed from the team" : "Role changed");
    onChanged();
  };
  return (
    <List label="Members">
      {team.members.map((member) => (
        <li key={member.id} className="flex items-center gap-2 px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{member.name ?? member.email}{member.id === team.you ? " (you)" : ""}</p>
            <p className="truncate text-xs text-muted-foreground">{member.email}</p>
          </div>
          {team.role === "owner" ? (
            <>
              <NativeSelect aria-label={`Role for ${member.email}`} value={member.role} onChange={(event) => change("PATCH", member.id, { role: event.target.value })}><RoleOptions /></NativeSelect>
              {member.id !== team.you && <Button variant="ghost" size="icon-sm" aria-label={`Remove ${member.email}`} onClick={() => change("DELETE", member.id)}><Trash2 /></Button>}
            </>
          ) : (
            <span className="shrink-0 text-muted-foreground">{roles[member.role]}</span>
          )}
        </li>
      ))}
    </List>
  );
}

function InvitePeople({ team, onChanged, onError }: { team: TeamDetails; onChanged: () => void; onError: (error: string) => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const invite = async (event: FormEvent) => {
    event.preventDefault();
    const { ok, data } = await postJson<{ error?: string }>(`/api/teams/${team.handle}/invites`, { email, role });
    if (!ok) return onError(data.error ?? "That didn't send.");
    toast.success(`Invited ${email}`);
    setEmail("");
    onChanged();
  };
  const cancel = async (id: string) => {
    await sendJson("DELETE", `/api/teams/${team.handle}/invites/${id}`);
    onChanged();
  };
  return (
    <Section title="Invite someone" description="They'll see the invite under Teams when they sign in with Google using this address. Editors can change tables. Owners can also manage the team.">
      <form onSubmit={invite} className="flex flex-wrap gap-2">
        <Input className="min-w-48 flex-1" type="email" aria-label="Email address" placeholder="name@example.com" required value={email} onChange={(event) => setEmail(event.target.value)} />
        <NativeSelect aria-label="Role" value={role} onChange={(event) => setRole(event.target.value as Role)}><RoleOptions /></NativeSelect>
        <Button type="submit" variant="outline">Invite</Button>
      </form>
      {team.invites.length > 0 && (
        <List label="Invited">
          {team.invites.map((invited) => (
            <li key={invited.id} className="flex items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1 truncate">{invited.email}</span>
              <span className="shrink-0 text-muted-foreground">{roles[invited.role]}, invited</span>
              <Button variant="ghost" size="icon-sm" aria-label={`Cancel the invite to ${invited.email}`} onClick={() => cancel(invited.id)}><Trash2 /></Button>
            </li>
          ))}
        </List>
      )}
    </Section>
  );
}

function LeaveOrDelete({ team, onError }: { team: TeamDetails; onError: (error: string) => void }) {
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
    <>
      <Section title="Leave this team">
        <div><Button variant="outline" onClick={leave}>Leave team</Button></div>
      </Section>
      {team.role === "owner" && team.handle !== "skeletable" && (
        <Section title="Delete this team" description="This removes the team and every table it owns for good.">
          <ConfirmButton label="Delete team" confirm={`Delete ${team.name}`} onConfirm={remove} />
        </Section>
      )}
    </>
  );
}

/** Who's on a team, and for its owners, how to change that. */
export function TeamSettings({ handle }: { handle: string }) {
  const { refresh } = useMe();
  const { data: team, status, retry } = useJson<TeamDetails>(`/api/teams/${handle}`);
  const [error, setError] = useState<string>();
  const changed = () => {
    setError(undefined);
    retry();
    refresh();
  };

  return (
    <SettingsLayout title={team?.name ?? "Team"}>
      {status === "missing" ? (
        <Message title="There's no team here" />
      ) : status === "failed" ? (
        <LoadFailed what="This team" retry={retry} />
      ) : team ? (
        <>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">{team.name}</h2>
            <Link href={`/${team.handle}`} className="text-sm text-muted-foreground hover:text-foreground hover:underline">skeletable.com/{team.handle}</Link>
          </div>
          <FormError error={error} />
          {team.role === "owner" && <Section title="Team details"><TeamProfile key={team.name + team.bio} team={team} onChanged={changed} onError={setError} /></Section>}
          <Section title="Members"><Members team={team} onChanged={changed} onError={setError} /></Section>
          {team.role === "owner" && <InvitePeople team={team} onChanged={changed} onError={setError} />}
          <LeaveOrDelete team={team} onError={setError} />
        </>
      ) : (
        <LoadingList rows={3} label="Loading team" />
      )}
    </SettingsLayout>
  );
}
