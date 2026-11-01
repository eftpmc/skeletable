import { useEffect } from "react";
import { Logo } from "@/components/Chrome";
import { Page } from "@/components/Shell";
import { TableList } from "@/components/TableList";
import { Button } from "@/components/ui/button";
import { useJson, type TableSummary } from "@/lib/api";
import { accountName } from "@/lib/cells";
import { Message } from "@/pages/Message";

/** One account's public page: who they are and their tables. */
export function Account({ owner }: { owner: string }) {
  const { data, status, retry } = useJson<TableSummary[]>("/api/tables");
  const tables = data?.filter((table) => table.owner === owner);
  const name = accountName(owner);

  useEffect(() => {
    document.title = name;
  }, [name]);

  return (
    <Page>
      <main className="mx-auto max-w-4xl px-4 pt-8 pb-16 sm:px-6">
        {status === "failed" ? (
          <Message title="This account didn't load" action={<Button variant="outline" size="sm" onClick={retry}>Try again</Button>} />
        ) : tables?.length === 0 ? (
          <Message title="There's no account here" />
        ) : (
          <>
            <div className="mb-6 flex items-center gap-3">
              <Logo className="size-12" />
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
                <p className="text-sm text-muted-foreground">{tables ? `${tables.length} tables` : " "}</p>
              </div>
            </div>
            <TableList tables={tables} />
          </>
        )}
      </main>
    </Page>
  );
}
