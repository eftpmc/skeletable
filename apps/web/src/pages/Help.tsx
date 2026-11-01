import { useEffect, type ReactNode } from "react";
import { Link } from "wouter";
import { AgentCommand } from "@/components/Chrome";
import { Content, PageHeader, Section } from "@/components/Layout";
import { Page } from "@/components/Shell";
import { Shortcuts } from "@/components/Shortcuts";
import { contactEmail } from "@/lib/site";
import { statuses, type CellStatus } from "@/lib/status";

const order: CellStatus[] = ["confirmed", "summary", "once", "gap", "gone", "fracture"];

const Prose = ({ children }: { children: ReactNode }) => <div className="space-y-2 text-sm leading-relaxed">{children}</div>;

/** How to read a table, how far to trust it, and how to reach us. */
export function Help() {
  useEffect(() => {
    document.title = "Help · Skeletable";
  }, []);
  return (
    <Page crumbs={[{ label: "Help" }]}>
      <Content size="narrow">
        <PageHeader title="Help" description="How the tables work, and how far to trust them." />
        <div className="space-y-6">
          <Section title="Reading a table">
            <Prose>
              <p>Select any value in a sheet to see the exact words that state it, and a link to where they came from. The mark in a cell's corner shows how far it was checked. "Not found" means no source we could use said so, which never means no. "None stated" means the source was read and gives no such value.</p>
              <p>Sort by clicking a column, and use Find and Filter at the bottom of the sheet. On a table you run, select a cell and type, type a name in an empty row to add it, and type in the last heading to add a column. Options holds the rest, and Agent hands the table to your own agent. Share gives you a link to the live table with your view kept, and Download saves what you're looking at.</p>
            </Prose>
          </Section>
          <Section title="How values are checked" description="Turn on X-ray in a sheet to see this for every cell.">
            <ul className="space-y-2 text-sm">
              {order.map((status) => {
                const { label, detail, icon: Icon, tint } = statuses[status];
                return (
                  <li key={status} className="flex items-center gap-2.5">
                    <span className={`grid size-6 shrink-0 place-items-center rounded-md ${tint || "bg-muted"}`}><Icon className="size-3.5" /></span>
                    <span><span className="font-medium">{label}.</span> <span className="text-muted-foreground">{detail}.</span></span>
                  </li>
                );
              })}
            </ul>
          </Section>
          <Section title="Suggesting a change">
            <Prose><p>Sign in, select a cell, and give the new value with a link and the exact words that state it. We check the words are on the page, then the table's owners review it.</p></Prose>
          </Section>
          <Section title="Using tables from an agent" description="Public tables need no account. To reach your private tables or propose changes, make a token in Settings.">
            <AgentCommand />
          </Section>
          <Section title="Keyboard shortcuts" description="These work in a sheet.">
            <Shortcuts />
          </Section>
          <Section title="Get in touch">
            <Prose>
              {contactEmail ? <p>Email <a className="underline" href={`mailto:${contactEmail}`}>{contactEmail}</a>.</p> : <p>The quickest way to fix a value is to suggest a change on its cell.</p>}
              <p>See also our <Link href="/terms" className="underline">Terms</Link> and <Link href="/privacy" className="underline">Privacy</Link> pages.</p>
            </Prose>
          </Section>
        </div>
      </Content>
    </Page>
  );
}
