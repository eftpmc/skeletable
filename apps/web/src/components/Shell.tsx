import { ArrowLeft, Menu } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { AccountButton, AgentButton, AgentDialog, Logo, ThemeButton } from "@/components/Chrome";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { signInHref } from "@/lib/account";
import { useMe } from "@/lib/api";
import { useTheme } from "@/lib/theme";

/** One step of where you are. The last is the current page, so it needs no link. */
export type Crumb = { label: string; href?: string };

const BROWSE = { href: "/explore", label: "Browse tables" };

/** What a signed-out phone gets in place of the links and buttons that fit on a wider screen. */
function PublicMenu() {
  const { canSignIn } = useMe();
  const { dark, toggle } = useTheme();
  const [agent, setAgent] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Menu"><Menu /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem asChild><Link href={BROWSE.href}>{BROWSE.label}</Link></DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setAgent(true)}>Connect an agent</DropdownMenuItem>
          <DropdownMenuItem onSelect={(event) => { event.preventDefault(); toggle(); }}>{dark ? "Use light theme" : "Use dark theme"}</DropdownMenuItem>
          {canSignIn && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild><a href={signInHref()}>Sign in</a></DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <AgentDialog open={agent} onOpenChange={setAgent} />
    </>
  );
}

/**
 * The same bar on every screen. Wide screens show the path, each step a link. Phones show a back
 * arrow to the step before, and the page's name.
 */
export function AppBar({ crumbs = [], phoneTitle, actions }: { crumbs?: Crumb[]; phoneTitle?: string; actions?: ReactNode }) {
  const { user } = useMe();
  const [location] = useLocation();
  const current = crumbs.at(-1);
  const back = current && (crumbs.at(-2)?.href ?? "/");
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
      {back && (
        <Button variant="ghost" size="icon-sm" className="-ml-1.5 md:hidden" aria-label="Back" asChild>
          <Link href={back}><ArrowLeft /></Link>
        </Button>
      )}
      <Link href="/" aria-label="Skeletable home" className={`shrink-0 items-center gap-2 font-medium tracking-tight ${back ? "hidden md:flex" : "flex"}`}>
        <Logo className="size-8" />
        {!current && "Skeletable"}
      </Link>
      {current && <p className="min-w-0 truncate font-medium md:hidden">{phoneTitle ?? current.label}</p>}
      {current && (
        <nav aria-label="Where you are" className="hidden min-w-0 items-center gap-1.5 text-sm md:flex">
          {crumbs.map(({ label, href }, index) => (
            <span key={`${index}-${label}`} className="flex min-w-0 items-center gap-1.5">
              {index > 0 && <span aria-hidden="true" className="text-muted-foreground">/</span>}
              {href && index < crumbs.length - 1 ? (
                <Link href={href} className="max-w-48 truncate text-muted-foreground transition-colors hover:text-foreground">{label}</Link>
              ) : (
                <span aria-current="page" className="truncate font-medium">{label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <Link
          href={BROWSE.href}
          aria-current={location === BROWSE.href ? "page" : undefined}
          className="mr-1.5 hidden text-sm text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:text-foreground md:block"
        >
          {BROWSE.label}
        </Link>
        {actions}
        {user ? (
          <AccountButton />
        ) : (
          <>
            <div className="hidden items-center gap-1 md:flex">
              <AgentButton />
              <ThemeButton />
              <AccountButton />
            </div>
            <div className="md:hidden"><PublicMenu /></div>
          </>
        )}
      </div>
    </header>
  );
}

function Footer() {
  const links = [["/about", "About"], ["/help", "Help"], ["/terms", "Terms"], ["/privacy", "Privacy"]];
  return (
    <footer className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-6 text-sm text-muted-foreground sm:px-6">
      <span>Skeletable</span>
      {links.map(([href, label]) => <Link key={href} href={href!} className="hover:text-foreground">{label}</Link>)}
      <span className="sm:ml-auto">Tables under CC BY 4.0</span>
    </footer>
  );
}

export function Page({ crumbs, children }: { crumbs?: Crumb[]; children: ReactNode }) {
  const [location] = useLocation();
  return (
    <div className="min-h-svh">
      <AppBar crumbs={crumbs} />
      <div key={location} className="duration-200 animate-in fade-in slide-in-from-bottom-1 motion-reduce:animate-none">{children}</div>
      <Footer />
    </div>
  );
}
