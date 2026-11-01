import { GitPullRequestArrow, Plus, Table2 } from "lucide-react";
import { useEffect } from "react";
import { Link } from "wouter";
import { AccountMark } from "@/components/AccountMark";
import { Content, EmptyState, List, LoadFailed, PageHeader } from "@/components/Layout";
import { Page } from "@/components/Shell";
import { TableList } from "@/components/TableList";
import { Button } from "@/components/ui/button";
import { useJson, type Me, type TableSummary } from "@/lib/api";
import { accountName } from "@/lib/cells";

type Waiting = { id: string; owner: string; slug: string; title: string; row: string; column: string };

/** What needs you, as a short list above your tables. */
function Inbox() {
  const { data } = useJson<Waiting[]>("/api/inbox");
  if (!data?.length) return null;
  return (
    <section className="mb-6">
      <h2 className="mb-2 font-medium">Waiting for you</h2>
      <List>
        {data.map((item) => (
          <li key={item.id}>
            <Link href={`/${item.owner}/${item.slug}/proposals`} className="flex items-center gap-2.5 px-3 py-2 transition-colors hover:bg-muted/50">
              <GitPullRequestArrow className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 truncate"><span className="font-medium">{item.title}</span> <span className="text-muted-foreground">· {item.row}</span></span>
            </Link>
          </li>
        ))}
      </List>
    </section>
  );
}

/** One account's tables under its name, so it's clear whose they are. */
function AccountTables({ handle, name, tables, empty }: { handle: string; name: string; tables?: TableSummary[]; empty?: string }) {
  return (
    <section>
      <h2 className="mb-2 font-medium">
        <Link href={`/${handle}`} className="inline-flex items-center gap-2 hover:underline">
          <AccountMark handle={handle} name={name} className="size-6 text-xs" />
          {name}
        </Link>
      </h2>
      {tables?.length === 0 && empty ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 text-sm">
          <span className="text-muted-foreground">{empty}</span>
          <Button size="sm" variant="outline" asChild><Link href="/new">New table</Link></Button>
        </div>
      ) : (
        <TableList tables={tables} />
      )}
    </section>
  );
}

/** What a signed-in person lands on: what needs them, then tables by who owns them. */
export function YourHome({ user }: { user: NonNullable<Me["user"]> }) {
  const { data, status, retry } = useJson<TableSummary[]>("/api/tables");
  const ownedBy = (handle: string) => data?.filter((table) => table.owner === handle);
  const shared = data?.filter((table) => table.private && !user.accounts.includes(table.owner));

  useEffect(() => {
    document.title = "Tables · Skeletable";
  }, []);

  return (
    <Page>
      <Content>
        <PageHeader title="Tables" actions={<Button asChild><Link href="/new"><Plus />New table</Link></Button>} />
        <Inbox />
        {status === "failed" ? (
          <LoadFailed what="Your tables" retry={retry} />
        ) : !user.teams.length && data?.length !== undefined && !ownedBy(user.handle ?? "")?.length && !shared?.length ? (
          <EmptyState
            icon={Table2}
            title="Start your first table"
            body="Pick something you want reliable data on, or see what others have built."
            action={
              <>
                <Button size="sm" asChild><Link href="/new">New table</Link></Button>
                <Button size="sm" variant="outline" asChild><Link href="/explore">Browse tables</Link></Button>
              </>
            }
          />
        ) : (
          <div className="space-y-8">
            {user.handle && <AccountTables handle={user.handle} name={accountName(user.handle)} tables={ownedBy(user.handle)} empty="You don't have any tables of your own yet." />}
            {user.teams.map((team) => <AccountTables key={team.handle} handle={team.handle} name={team.name} tables={ownedBy(team.handle)} empty="This team doesn't have any tables yet." />)}
            {!!shared?.length && (
              <section>
                <h2 className="mb-2 font-medium">Shared with you</h2>
                <TableList tables={shared} />
              </section>
            )}
          </div>
        )}
      </Content>
    </Page>
  );
}
