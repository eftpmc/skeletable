import { useEffect } from "react";
import { Link } from "wouter";
import { Logo } from "@/components/Chrome";
import { Page } from "@/components/Shell";
import { TableList } from "@/components/TableList";
import { Button } from "@/components/ui/button";
import { useJson, useMe, type TableSummary } from "@/lib/api";
import { accountName } from "@/lib/cells";
import { Message } from "@/pages/Message";

/** One account's public page: who they are and their tables. An empty account only exists to its owner. */
export function Account({ owner }: { owner: string }) {
  const { user } = useMe();
  const { data, status, retry } = useJson<TableSummary[]>("/api/tables");
  const tables = data?.filter((table) => table.owner === owner);
  const team = user?.teams.find((candidate) => candidate.handle === owner);
  const name = team?.name ?? tables?.[0]?.ownerName ?? accountName(owner);
  const yours = user?.accounts.includes(owner);

  useEffect(() => {
    document.title = name === "Skeletable" ? name : `${name} · Skeletable`;
  }, [name]);

  return (
    <Page>
      <main className="mx-auto max-w-5xl px-4 pt-8 pb-16 sm:px-6">
        {status === "failed" ? (
          <Message title="This account didn't load" action={<Button variant="outline" size="sm" onClick={retry}>Try again</Button>} />
        ) : tables?.length === 0 && !yours ? (
          <Message title="There's no account here" />
        ) : (
          <>
            <div className="mb-6 flex items-center gap-3">
              <Logo className="size-12" />
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
                <p className="text-sm text-muted-foreground">{tables ? `${tables.length} ${tables.length === 1 ? "table" : "tables"}` : " "}</p>
              </div>
              {team && <Button variant="outline" size="sm" asChild><Link href={`/settings/teams/${owner}`}>Manage team</Link></Button>}
            </div>
            {tables?.length === 0 ? (
              <div className="rounded-xl border p-8 text-center">
                <p className="font-medium">This is your public page</p>
                <p className="mt-1 mb-4 text-sm text-muted-foreground">Tables you publish show up here for anyone to see.</p>
                <Button size="sm" asChild><Link href="/new">New table</Link></Button>
              </div>
            ) : (
              <TableList tables={tables} />
            )}
          </>
        )}
      </main>
    </Page>
  );
}
