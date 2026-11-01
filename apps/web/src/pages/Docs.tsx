import { useEffect, type ReactNode } from "react";
import { Link } from "wouter";
import { AgentCommand } from "@/components/Chrome";
import { Content, LoadFailed, LoadingList, PageHeader, Section } from "@/components/Layout";
import { Page } from "@/components/Shell";
import { useJson, type TableSummary } from "@/lib/api";

const Prose = ({ children }: { children: ReactNode }) => <div className="space-y-2 text-sm leading-relaxed">{children}</div>;

const Code = ({ children }: { children: ReactNode }) => <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs break-all">{children}</code>;

function Totals() {
  const { data, status, retry } = useJson<TableSummary[]>("/api/tables");
  if (status === "failed") return <LoadFailed what="The totals" retry={retry} />;
  if (!data) return <LoadingList rows={2} label="Loading totals" />;
  const open = data.filter((table) => !table.private);
  const sum = (pick: (table: TableSummary) => number) => open.reduce((total, table) => total + pick(table), 0);
  const facts: [string, number][] = [
    ["Public tables", open.length],
    ["Confirmed by a second reader", sum((table) => table.checks.confirmed)],
    ["Matched a summary of the owner's pages", sum((table) => table.checks.summary)],
    ["Read once", sum((table) => table.checks.once)],
    ["Blank, because no source we could use stated it", sum((table) => table.checks.gap)],
  ];
  return (
    <dl className="divide-y rounded-xl border text-sm">
      {facts.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between gap-3 px-3 py-2">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-medium tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** What we check, how far each value has been checked, and what that can't tell you. */
export function Accuracy() {
  useEffect(() => {
    document.title = "How accurate is Skeletable?";
  }, []);
  return (
    <Page crumbs={[{ label: "Accuracy" }]}>
      <Content size="narrow">
        <PageHeader title="How accurate is this?" description="Every value shows how far it's been checked, so you can decide how far to trust it." />
        <div className="space-y-6">
          <Section title="Where the public tables stand" description="Live totals across every public table."><Totals /></Section>
          <Section title="How a value gets here">
            <Prose>
              <p>Every value needs a source and the exact words that state it. A number has to appear in its quote, and each quote has to be on its page when we check. If no source we can use states a value, the cell stays blank and says where we looked.</p>
              <p>For a second check, a separate reader answers the same question from the same source without seeing our value. Differences are settled against the source. Each day we also check that live quotes are still on their pages.</p>
            </Prose>
          </Section>
          <Section title="What this can't tell you">
            <Prose>
              <p>A blank never means no. It means no source we could use said so.</p>
              <p>A quote still being on its page doesn't prove its meaning held, and a page can be out of date and still contain its quotes.</p>
              <p>The second reader is also an AI, and we record what sources say, not how a court or an expert would read them. Check the source before relying on a value for anything important. This isn't legal, financial, medical or professional advice.</p>
              <p>We don't publish a single error rate, because we haven't measured one across every table.</p>
            </Prose>
          </Section>
          <Section title="Found a mistake?">
            <Prose><p>Select the cell in a sheet and suggest a change with its source. Past values stay in each table's <Link href="/explore" className="underline">history</Link>.</p></Prose>
          </Section>
        </div>
      </Content>
    </Page>
  );
}

/** How to use the tables from code or an agent. */
export function Developers() {
  useEffect(() => {
    document.title = "Developers · Skeletable";
  }, []);
  const origin = location.origin;
  return (
    <Page crumbs={[{ label: "Developers" }]}>
      <Content size="narrow">
        <PageHeader title="Developers" description="Use the tables from an agent, or as plain data files." />
        <div className="space-y-6">
          <Section title="MCP" description="A server any MCP client can connect to. Public tables need no account.">
            <AgentCommand />
            <Prose><p>It offers <Code>list_tables</Code>, <Code>get_table</Code> and <Code>get_cell</Code>, which gives a value's source and exact quote, and <Code>check_claim</Code>, which tests a statement against a cell. A token from Settings adds your private tables, <Code>propose_change</Code>, and <Code>create_table</Code>, <Code>add_columns</Code>, <Code>add_rows</Code> and <Code>fill_cells</Code> for building drafts. Each sheet's Agent button gives you the connect command and a ready prompt.</p></Prose>
          </Section>
          <Section title="Data files" description="Each public table has stable addresses, free to read and crawl.">
            <Prose>
              <p><Code>{origin}/data/skeletable/data-breach-laws.json</Code></p>
              <p><Code>{origin}/data/skeletable/data-breach-laws.csv</Code></p>
              <p>JSON has every value with its source, quote and read date. CSV has a source and quote column beside each value.</p>
            </Prose>
          </Section>
          <Section title="One value" description="Every public cell has its own addresses. Cite in a sheet copies them for you.">
            <Prose>
              <p><Code>{origin}/data/skeletable/data-breach-laws/texas/notify_days.csv</Code> is the bare value, for a formula in your own spreadsheet.</p>
              <p><Code>{origin}/data/skeletable/data-breach-laws/texas/notify_days.json</Code> adds its source, quote, date and status.</p>
              <p><Code>{origin}/embed/skeletable/data-breach-laws/texas/notify_days</Code> is a live card for your own pages, which shows it if the quote leaves its page.</p>
            </Prose>
          </Section>
          <Section title="Row pages">
            <Prose><p>Each row has a page with the proof for its values, at <Code>{origin}/skeletable/data-breach-laws/row/texas</Code>. A renamed row keeps its old address.</p></Prose>
          </Section>
          <Section title="Using the data">
            <Prose>
              <p>Public tables are under CC BY 4.0: reuse them, and credit Skeletable with a link. When a value is null or missing, no acceptable source stated it, so say it's unknown rather than filling it in.</p>
              <p>A short guide for AI tools is at <Code>{origin}/llms.txt</Code>.</p>
            </Prose>
          </Section>
        </div>
      </Content>
    </Page>
  );
}
