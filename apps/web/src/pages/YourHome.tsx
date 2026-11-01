import { GitPullRequestArrow, Plus } from "lucide-react";
import { useEffect } from "react";
import { Link } from "wouter";
import { Page } from "@/components/Shell";
import { TableList } from "@/components/TableList";
import { Button } from "@/components/ui/button";
import { useJson, type Me, type TableSummary } from "@/lib/api";
import { Message } from "@/pages/Message";

type Waiting = { id: string; owner: string; slug: string; title: string; row: string; column: string };

/** What needs you, as a short list above your tables. */
function Inbox() {
  const { data } = useJson<Waiting[]>("/api/inbox");
  if (!data?.length) return null;
  return (
    <section className="mb-6">
      <h2 className="mb-2 font-medium">Waiting for you</h2>
      <ul className="divide-y rounded-xl border text-sm">
        {data.map((item) => (
          <li key={item.id}>
            <Link href={`/${item.owner}/${item.slug}/proposals`} className="flex items-center gap-2.5 px-3 py-2 transition-colors hover:bg-muted/50">
              <GitPullRequestArrow className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 truncate"><span className="font-medium">{item.title}</span> <span className="text-muted-foreground">· {item.row}</span></span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** What a signed-in person lands on: what needs them, and the tables they run. */
export function YourHome({ user }: { user: NonNullable<Me["user"]> }) {
  const { data, status, retry } = useJson<TableSummary[]>("/api/tables");
  const tables = data?.filter((table) => user.accounts.includes(table.owner));

  useEffect(() => {
    document.title = "Your tables · Skeletable";
  }, []);

  return (
    <Page>
      <main className="mx-auto max-w-5xl px-4 pt-8 pb-16 sm:px-6">
        <div className="mb-6 flex items-center justify-between gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">Your tables</h1>
          <Button asChild>
            <Link href="/new"><Plus />New table</Link>
          </Button>
        </div>
        <Inbox />
        {status === "failed" ? (
          <Message title="Your tables didn't load" action={<Button variant="outline" size="sm" onClick={retry}>Try again</Button>} />
        ) : tables?.length === 0 ? (
          <div className="rounded-xl border p-8 text-center">
            <p className="font-medium">Start your first table</p>
            <p className="mt-1 mb-4 text-sm text-muted-foreground">Pick something you want reliable data on, or see what others have built.</p>
            <div className="flex justify-center gap-2">
              <Button size="sm" asChild><Link href="/new">New table</Link></Button>
              <Button size="sm" variant="outline" asChild><Link href="/explore">Browse tables</Link></Button>
            </div>
          </div>
        ) : (
          <TableList tables={tables} />
        )}
      </main>
    </Page>
  );
}
