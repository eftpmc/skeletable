import { useEffect } from "react";
import { Link } from "wouter";
import { UserPage } from "@/components/Shell";
import { TableList } from "@/components/TableList";
import { Button } from "@/components/ui/button";
import { useJson, type Me, type TableSummary } from "@/lib/api";
import { Message } from "@/pages/Message";

/** What a signed-in person lands on: the tables of the accounts they run. */
export function YourHome({ user }: { user: NonNullable<Me["user"]> }) {
  const { data, status, retry } = useJson<TableSummary[]>("/api/tables");
  const tables = data?.filter((table) => user.accounts.includes(table.owner));

  useEffect(() => {
    document.title = "Your tables · Skeletable";
  }, []);

  return (
    <UserPage>
      <main className="mx-auto max-w-4xl px-4 pt-8 pb-16 sm:px-6">
        <h1 className="mb-6 text-3xl font-semibold tracking-tight">Your tables</h1>
        {status === "failed" ? (
          <Message title="Your tables didn't load" action={<Button variant="outline" size="sm" onClick={retry}>Try again</Button>} />
        ) : tables?.length === 0 ? (
          <div className="rounded-xl border p-8 text-center">
            <p className="font-medium">Start with a table worth keeping</p>
            <p className="mt-1 mb-4 text-sm text-muted-foreground">Tables you run will show up here.</p>
            <Button size="sm" asChild>
              <Link href="/explore">Browse tables</Link>
            </Button>
          </div>
        ) : (
          <TableList tables={tables} />
        )}
      </main>
    </UserPage>
  );
}
