import { useEffect, type ReactNode } from "react";
import { Page } from "@/components/Shell";

const UPDATED = "November 1, 2026";

const Document = ({ title, updated = true, children }: { title: string; updated?: boolean; children: ReactNode }) => {
  useEffect(() => {
    document.title = `${title} · Skeletable`;
  }, [title]);
  return (
    <Page>
      <main className="mx-auto max-w-2xl px-4 pt-8 pb-16 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {updated && <p className="mt-1 text-sm text-muted-foreground">Last updated {UPDATED}</p>}
        <div className="mt-6 space-y-4 text-sm leading-relaxed [&_h2]:mt-6 [&_h2]:font-medium">{children}</div>
      </main>
    </Page>
  );
};

export const About = () => (
  <Document title="About" updated={false}>
    <p>Skeletable is a public library of tables. Every value links to the exact words that state it, or says where we looked and found nothing.</p>
    <p>Quotes are checked against their pages every day, each value shows how well it's been checked, and anyone can propose a correction with proof. Agents can read the same tables over MCP.</p>
    <h2>How far to trust it</h2>
    <p>Skeletable records what sources say. It can be wrong, and sources can be wrong too, so check the source before you rely on a value for anything important. This isn't legal, financial, medical or professional advice.</p>
  </Document>
);

export const Terms = () => (
  <Document title="Terms">
    <p>By using Skeletable, you agree to these terms.</p>
    <h2>The service</h2>
    <p>Skeletable is provided as it is, with no guarantee that any value is correct, complete or current, or that the service will always be available. Check the source before relying on anything here.</p>
    <h2>Your account</h2>
    <p>You sign in with Google. You're responsible for what happens under your account and its agent tokens. You can delete your account in Settings at any time.</p>
    <h2>What you add</h2>
    <p>You keep what rights you have in what you add. You give Skeletable and its users permission to host, show, copy and adapt it, including under the data licence below. Only add material you're allowed to share, keep quotes short, and don't add anything unlawful, misleading, abusive or private about someone else.</p>
    <h2>Data licence</h2>
    <p>Tables are offered under the Creative Commons Attribution 4.0 licence (CC BY 4.0), so you can reuse them if you credit Skeletable and link back. Quotes belong to their sources and are included as short excerpts for reference.</p>
    <h2>Acceptable use</h2>
    <p>Don't try to break, overload or get around the limits of the service. We can remove content or block accounts that break these terms.</p>
    <h2>Limit of liability</h2>
    <p>To the extent the law allows, Skeletable isn't liable for losses from using the service or relying on its data.</p>
    <h2>Changes</h2>
    <p>We may update these terms, and we'll change the date above when we do. Continuing to use Skeletable means you accept the new terms.</p>
  </Document>
);

export const Privacy = () => (
  <Document title="Privacy">
    <p>This is what Skeletable stores about you, and why.</p>
    <h2>What we store</h2>
    <p>When you sign in with Google, we store your email address and name, a session so you stay signed in, and hashes of any agent tokens you create. We also store the tables and proposals you create, with your public name beside them.</p>
    <h2>What's public</h2>
    <p>Your account name, your public tables, and your name on proposals and changes are public. Your email address isn't.</p>
    <h2>Usage</h2>
    <p>We count page visits and agent requests per day, with no address or identity attached. To limit abuse, we hold visitors' network addresses briefly in memory, and our host keeps standard server logs. We don't use advertising trackers or sell data.</p>
    <h2>Who handles your data</h2>
    <p>Google handles sign-in, and Railway hosts the site and its database.</p>
    <h2>Your choices</h2>
    <p>You can change your name in Settings or delete your account there. Deleting it removes your email, name, tokens, sign-ins and tables. Proposals you made to other people's tables stay, with your name removed. Backups may hold old data until they expire.</p>
    <h2>Contact</h2>
    <p>For privacy questions, reach the Skeletable team through the contact details on this site's GitHub or domain records.</p>
  </Document>
);
