import type { ReactNode } from "react";
import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Content, PageHeader, SignInLink } from "@/components/Layout";
import { Page, type Crumb } from "@/components/Shell";
import { ownsAccount } from "@/lib/account";
import { useMe } from "@/lib/api";
import { Message } from "@/pages/Message";

const sections = [
  { href: "/settings", label: "Profile" },
  { href: "/settings/teams", label: "Teams" },
  { href: "/settings/tokens", label: "Agent tokens" },
  { href: "/settings/account", label: "Account" },
];

/** Every settings page, with the same way around them: down the side, or across the top on a phone. */
export function SettingsLayout({ title, crumbs = [], children }: { title: string; crumbs?: Crumb[]; children: ReactNode }) {
  const { user } = useMe();
  const [location] = useLocation();

  useEffect(() => {
    document.title = `${title} · Skeletable`;
  }, [title]);

  if (!user) {
    return (
      <Page>
        <Content size="narrow"><Message title="Sign in to see your settings" action={<SignInLink />} /></Content>
      </Page>
    );
  }

  return (
    <Page crumbs={[{ label: "Settings", href: "/settings" }, ...crumbs]}>
      <Content>
        <PageHeader title="Settings" />
        <div className="grid gap-6 md:grid-cols-[11rem_minmax(0,1fr)] md:gap-10">
          <nav aria-label="Settings" className="-mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:flex-col md:px-0">
            {[...sections, ...(ownsAccount(user, "skeletable") ? [{ href: "/settings/visits", label: "Visits" }] : [])].map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                aria-current={location === href || (href !== "/settings" && location.startsWith(href)) ? "page" : undefined}
                className="shrink-0 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:font-medium aria-[current=page]:text-foreground"
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="min-w-0 space-y-6">{children}</div>
        </div>
      </Content>
    </Page>
  );
}
