import { useEffect, type ReactNode } from "react";
import { Link } from "wouter";
import { AgentCommand } from "@/components/Chrome";
import { Content, LoadFailed, LoadingList, PageHeader, Section } from "@/components/Layout";
import { Page } from "@/components/Shell";
import { useJson, type TableSummary } from "@/lib/api";

const Prose = ({ children }: { children: ReactNode }) => <div className="space-y-2 text-sm leading-relaxed">{children}</div>;

const Code = ({ children }: { children: ReactNode }) => <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs break-all">{children}</code>;

const Command = ({ children }: { children: ReactNode }) => <pre className="overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs"><code>{children}</code></pre>;

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

/** The editorial rules that make a published value traceable and correctable. */
export function Methodology() {
  useEffect(() => {
    document.title = "Methodology and corrections · Skeletable";
  }, []);
  return (
    <Page crumbs={[{ label: "Methodology" }]}>
      <Content size="narrow">
        <PageHeader title="How Skeletable verifies and corrects facts" description="A published value is a claim with evidence, not a line in a spreadsheet." />
        <div className="space-y-6">
          <Section title="Evidence standard">
            <Prose>
              <p>Every stated value needs a source and the exact words from that source that support it. Numbers must appear in the quoted text. A value is only published when its quote is found on the cited page.</p>
              <p>If no acceptable source states a value, the cell stays blank. It records where we looked; a blank never means the answer is no.</p>
            </Prose>
          </Section>
          <Section title="Checks and freshness">
            <Prose>
              <p>Each public cell shows how far it has been checked. A second reader can independently answer the same question from the same source, and differences are settled against the source. We also check whether live quotes are still present on their pages.</p>
              <p>Check the source and read date before relying on a value. A page retaining a quote does not prove that its meaning or the surrounding law, product, or policy has not changed.</p>
            </Prose>
          </Section>
          <Section title="Corrections and review">
            <Prose>
              <p>Anyone signed in can select a cell and suggest a correction with its source and exact quote. Related corrections can be submitted as one proposal bundle, so a reviewer sees the full context.</p>
              <p>An owner or editor accepts the bundle together or closes it. Acceptance stops if a proposed cell changed after submission, preventing a stale proposal from overwriting a newer value. Accepted values remain in the table's history.</p>
            </Prose>
          </Section>
          <Section title="What we do not claim">
            <Prose>
              <p>We record what sources state; we do not decide legal meaning or provide legal, medical, financial, or other professional advice. We do not claim a site-wide error rate because we have not measured one across every table.</p>
              <p>Find a problem? Open the relevant table, select the cell, and send a proposal with better evidence.</p>
            </Prose>
          </Section>
          <Section title="Using and citing the data">
            <Prose><p>Public tables are available under CC BY 4.0. Cite Skeletable with the permanent table or row URL, then cite the underlying source when relying on a specific value.</p></Prose>
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
          <Section title="Connect an MCP client" description="Public tables need no account. Every supported client uses the same Streamable HTTP endpoint.">
            <Prose><p><Code>{origin}/mcp</Code></p></Prose>
            <div className="space-y-4">
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Codex</h3>
                <Command>{`codex mcp add skeletable --url ${origin}/mcp`}</Command>
                <Prose><p>Then run <Code>codex mcp list</Code> to confirm it is connected. In the ChatGPT desktop app or Codex IDE extension, open Settings, choose MCP servers, add a Streamable HTTP server, and use the same URL.</p></Prose>
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Claude and Claude Desktop</h3>
                <Prose><p>Open <strong>Customize → Connectors → Add → Add custom connector</strong>. Name it Skeletable, enter <Code>{origin}/mcp</Code>, and choose <strong>No sign in</strong> for public tables.</p></Prose>
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Any other compatible client</h3>
                <Prose><p>Add a remote or Streamable HTTP MCP server and set its URL to <Code>{origin}/mcp</Code>. It does not need a token to read public tables.</p></Prose>
              </div>
            </div>
          </Section>
          <Section title="MCP tools" description="A server any MCP client can connect to. Public tables need no account.">
            <AgentCommand />
            <Prose><p>Claude Code users can use the command above. It offers <Code>list_tables</Code>, <Code>get_table</Code> and <Code>get_cell</Code>, which gives a value's source and exact quote, and <Code>check_claim</Code>, which tests a statement against a cell. A token from Settings adds your private tables, <Code>propose_change</Code>, and <Code>create_table</Code>, <Code>add_columns</Code>, <Code>add_rows</Code> and <Code>fill_cells</Code> for building drafts. Each sheet's Agent button gives you the connect command and a ready prompt.</p></Prose>
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
