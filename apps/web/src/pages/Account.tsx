import { useEffect } from "react";
import { Link } from "wouter";
import { AccountMark } from "@/components/AccountMark";
import { Content, EmptyState, LoadFailed } from "@/components/Layout";
import { Page } from "@/components/Shell";
import { TableList } from "@/components/TableList";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useJson, useMe, type TableSummary } from "@/lib/api";
import { accountName } from "@/lib/cells";
import { Message } from "@/pages/Message";

type AccountDetails = { handle: string; team: boolean; bio: string; name?: string; members?: number };

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** One account's page: who they are and their tables. An account with nothing to show only exists to the people in it. */
export function Account({ owner }: { owner: string }) {
  const { user } = useMe();
  const account = useJson<AccountDetails>(`/api/accounts/${owner}`);
  const list = useJson<TableSummary[]>("/api/tables");
  const tables = list.data?.filter((table) => table.owner === owner);
  const details = account.data;
  const name = details?.name ?? accountName(owner);
  const yours = user?.accounts.includes(owner);
  const team = user?.teams.find((candidate) => candidate.handle === owner);

  useEffect(() => {
    if (details) document.title = name === "Skeletable" ? name : `${name} · Skeletable`;
  }, [details, name]);

  return (
    <Page crumbs={[{ label: name }]}>
      <Content>
        {account.status === "missing" ? (
          <Message title="There's no account here" />
        ) : account.status === "failed" || list.status === "failed" ? (
          <LoadFailed what="This account" retry={() => { account.retry(); list.retry(); }} />
        ) : !details ? (
          <div className="flex items-center gap-3" aria-label="Loading account">
            <Skeleton className="size-14 rounded-lg" />
            <Skeleton className="h-8 w-48" />
          </div>
        ) : (
          <>
            <header className="mb-6 flex flex-wrap items-center gap-3">
              <AccountMark handle={owner} name={name} kind={details.team ? "team" : "person"} className="size-14 text-2xl" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
                  {details.team && <Badge variant="outline">Team</Badge>}
                  {team && <Badge variant="secondary" className="capitalize">{team.role}</Badge>}
                </div>
                {details.bio && <p className="mt-0.5 text-muted-foreground">{details.bio}</p>}
                <p className="text-sm text-muted-foreground">
                  {tables ? plural(tables.length, "table") : " "}
                  {details.team && details.members ? ` · ${plural(details.members, "member")}` : ""}
                </p>
              </div>
              {team && <Button variant="outline" size="sm" asChild><Link href={`/settings/teams/${owner}`}>Manage team</Link></Button>}
              {yours && !team && <Button variant="outline" size="sm" asChild><Link href="/settings">Edit profile</Link></Button>}
            </header>
            {tables?.length === 0 ? (
              <EmptyState
                title="This is your public page"
                body="Public tables show up here for anyone to see. Private ones only show to people who can open them."
                action={<Button size="sm" asChild><Link href="/new">New table</Link></Button>}
              />
            ) : (
              <TableList tables={tables} />
            )}
          </>
        )}
      </Content>
    </Page>
  );
}
