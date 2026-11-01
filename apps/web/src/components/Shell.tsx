import { Menu, Table2, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { AccountButton, AgentButton, Logo, PhoneAccount, ThemeButton } from "@/components/Chrome";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { accountLinks, type AccountLink } from "@/lib/account";
import { useMe } from "@/lib/api";

// Shared by every top bar and the phone menu, so the menu button and its X sit in the same spot.
const bar = "flex h-12 shrink-0 items-center gap-4 border-b px-4";

// The public library. Everything of your own lives in the account menu instead.
const browse: AccountLink = { href: "/explore", label: "Browse tables", icon: Table2 };

const BrandName = () => (
  <>
    <Logo className="size-7" />
    Skeletable
  </>
);

const Brand = () => (
  <Link href="/" className="flex items-center gap-2 font-medium tracking-tight">
    <BrandName />
  </Link>
);

function PhoneLinks({ links, label, onNavigate }: { links: AccountLink[]; label: string; onNavigate: () => void }) {
  const [location] = useLocation();
  return (
    <nav aria-label={label} className="flex flex-col gap-1">
      {links.map(({ href, label: text, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          onClick={onNavigate}
          aria-current={location === href ? "page" : undefined}
          className="flex items-center gap-2.5 rounded-md px-2.5 py-3 text-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:font-medium aria-[current=page]:text-foreground"
        >
          <Icon className="size-5" />
          {text}
        </Link>
      ))}
    </nav>
  );
}

/** On a phone, all navigation opens as one simple full-screen menu: the public library, then what's yours. */
function PhoneMenu() {
  const { user } = useMe();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Menu"><Menu /></Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="top-0 left-0 flex h-svh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none p-0 ring-0 sm:max-w-none"
      >
        <div className={bar}>
          <DialogTitle className="flex items-center gap-2 text-base font-medium tracking-tight"><BrandName /></DialogTitle>
          <DialogClose asChild>
            <Button variant="ghost" size="icon-sm" className="ml-auto" aria-label="Close menu"><X /></Button>
          </DialogClose>
        </div>
        <DialogDescription className="sr-only">Where to go next</DialogDescription>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="p-4">
            <PhoneLinks links={[browse]} label="Main" onNavigate={close} />
          </div>
          {user && (
            <div className="space-y-2 border-t p-4">
              <PhoneAccount user={user} />
              <PhoneLinks links={accountLinks(user.handle, user.teams, user.invites)} label="Your account" onNavigate={close} />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 border-t p-4">
          <AgentButton label="Connect an agent" />
          <div className="ml-auto flex items-center gap-1">
            <ThemeButton />
            {!user && <AccountButton />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
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

const PhoneBar = () => (
  <header className={`${bar} md:hidden`}>
    <Brand />
    <div className="ml-auto flex"><PhoneMenu /></div>
  </header>
);

/** The same bar for everyone. Signing in only swaps the far right, where your account menu takes over. */
function TopBar() {
  const { user } = useMe();
  const [location] = useLocation();
  return (
    <header className={`${bar} hidden md:flex`}>
      <Brand />
      <Link
        href={browse.href}
        aria-current={location === browse.href ? "page" : undefined}
        className="text-sm text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:text-foreground"
      >
        {browse.label}
      </Link>
      <div className="ml-auto flex items-center gap-1">
        {!user && (
          <>
            <AgentButton />
            <ThemeButton />
          </>
        )}
        <AccountButton />
      </div>
    </header>
  );
}

export function Page({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return (
    <div className="min-h-svh">
      <PhoneBar />
      <TopBar />
      <div key={location} className="duration-200 animate-in fade-in slide-in-from-bottom-1 motion-reduce:animate-none">{children}</div>
      <Footer />
    </div>
  );
}
