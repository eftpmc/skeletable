import type { FoundCell } from "@skeleton/tables/format";
import { rowSlugs } from "@skeleton/tables/share";
import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Content, List, LoadFailed, LoadingList, PageHeader } from "@/components/Layout";
import { NoTable } from "@/components/NoTable";
import { ProofDetails } from "@/components/Proof";
import { ShareButton } from "@/components/Share";
import { Page } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { useJson } from "@/lib/api";
import { accountName, cellId, day, display, ownerLabel, rowPath } from "@/lib/cells";
import { cellStatus, statuses, type PublishedTable } from "@/lib/status";

const isFound = (cell: PublishedTable["rows"][number]["cells"][string]): cell is FoundCell => !("missing" in cell);

function RowDetails({ table, rowKey, onChanged }: { table: PublishedTable; rowKey: string; onChanged: () => void }) {
  const row = table.rows.find((candidate) => candidate.key === rowKey)!;
  const path = rowPath(table, rowKey);
  const url = `${location.origin}${path}`;
  const sheet = `/${table.owner}/${table.slug}/sheet`;

  useEffect(() => {
    document.title = `${rowKey}: ${table.title} · Skeletable`;
  }, [rowKey, table.title]);

  return (
    <>
      <PageHeader
        title={rowKey}
        description={<>From <Link href={`/${table.owner}/${table.slug}`} className="underline">{table.title}</Link>. {table.question}</>}
        actions={<ShareButton table={table} path={path} onChanged={onChanged} />}
      />
      <List label={`Values for ${rowKey}`}>
        {table.columns.map((column) => {
          const cell = row.cells[column.id]!;
          const status = cellStatus(cell, rowKey, column.id, table.watch);
          return (
            <li key={column.id} className="space-y-2 px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <h2 className="font-medium">{column.label}</h2>
                <p className="text-base font-semibold">{isFound(cell) ? `${display(cell.value)}${column.unit ? ` ${column.unit}` : ""}` : <span className="font-normal text-muted-foreground">{statuses[status].label}</span>}</p>
              </div>
              <p className="text-xs text-muted-foreground">{column.rule}</p>
              {isFound(cell) ? (
                <>
                  <ProofDetails cell={cell} status={status} title={table.title} url={url} />
                  <p className="text-xs text-muted-foreground">Read {day(cell.read)}</p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">{cell.absent ? `${statuses[status].detail}.` : `${statuses[status].detail}. A blank never means no.`}</p>
              )}
            </li>
          );
        })}
      </List>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild><Link href={`${sheet}?cell=${cellId(rowKey, table.columns[0]!.id)}`}>Open in the sheet</Link></Button>
        <Button variant="ghost" size="sm" asChild><Link href="/accuracy">How we check values</Link></Button>
      </div>
    </>
  );
}

/** One row with the proof for each of its values: what someone arriving from a search came for. */
export function RowPage({ owner, slug, rowSlug }: { owner: string; slug: string; rowSlug: string }) {
  const { data, status, retry } = useJson<PublishedTable>(`/api/tables/${owner}/${slug}`);
  const [, navigate] = useLocation();
  const slugs = data && rowSlugs(data);
  const rowKey = data?.rows.find((row) => slugs!.get(row.key) === rowSlug)?.key;
  const moved = data?.moved?.[rowSlug];

  useEffect(() => {
    if (data && !rowKey && moved && slugs!.has(moved)) navigate(rowPath(data, moved), { replace: true });
  }, [data, rowKey, moved, slugs, navigate]);

  const crumbs = [
    { label: data ? ownerLabel(data) : accountName(owner), href: `/${owner}` },
    { label: data?.title ?? "Table", href: `/${owner}/${slug}` },
    { label: rowKey ?? "Row" },
  ];
  return (
    <Page crumbs={crumbs}>
      <Content size="narrow">
        {status === "missing" || (data && !rowKey && !moved) ? (
          <NoTable />
        ) : status === "failed" ? (
          <LoadFailed what="This row" retry={retry} />
        ) : data && rowKey ? (
          <RowDetails table={data} rowKey={rowKey} onChanged={retry} />
        ) : (
          <LoadingList rows={4} label="Loading row" />
        )}
      </Content>
    </Page>
  );
}
