import { GitPullRequestArrow, Plus, Table2 } from "lucide-react";
import { useEffect } from "react";
import { Link } from "wouter";
import { Content, EmptyState, List, LoadFailed, PageHeader } from "@/components/Layout";
import { Page } from "@/components/Shell";
import { TableList } from "@/components/TableList";
import { Button } from "@/components/ui/button";
import { useJson, type Me, type TableSummary } from "@/lib/api";

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

/** What a signed-in person lands on: what needs them, and the tables they run. */
export function YourHome({ user }: { user: NonNullable<Me["user"]> }) {
  const { data, status, retry } = useJson<TableSummary[]>("/api/tables");
  const tables = data?.filter((table) => user.accounts.includes(table.owner));
  const shared = data?.filter((table) => table.private && !user.accounts.includes(table.owner));

  useEffect(() => {
    document.title = "Your tables · Skeletable";
  }, []);

  return (
    <Page>
      <Content>
        <PageHeader title="Your tables" actions={<Button asChild><Link href="/new"><Plus />New table</Link></Button>} />
        <Inbox />
        {status === "failed" ? (
          <LoadFailed what="Your tables" retry={retry} />
        ) : tables?.length === 0 ? (
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
          <TableList tables={tables} />
        )}
        {!!shared?.length && (
          <section className="mt-8">
            <h2 className="mb-2 font-medium">Shared with you</h2>
            <TableList tables={shared} />
          </section>
        )}
      </Content>
    </Page>
  );
}
