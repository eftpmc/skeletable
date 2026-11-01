import { Menu, PanelLeft, Table2, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { AccountButton, AgentButton, Logo, PhoneAccount, ThemeButton } from "@/components/Chrome";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { accountLinks, type AccountLink } from "@/lib/account";
import { useMe } from "@/lib/api";

// Shared by every top bar and the phone menu, so the menu button and its X sit in the same spot.
const bar = "flex h-12 shrink-0 items-center gap-4 border-b px-4";

const RAIL_KEY = "rail";

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

const browse: AccountLink = { href: "/explore", label: "Browse tables", icon: Table2 };

/** The rail leaves your account to its menu. A phone has no such menu, so it lists everything. */
function useNavItems(everything = false) {
  const { user } = useMe();
  if (!user) return [browse];
  const [home, ...rest] = accountLinks(user.handle);
  return [home!, browse, ...(everything ? rest : [])];
}

function NavLinks({ onNavigate, size = "normal" }: { onNavigate?: () => void; size?: "icons" | "normal" | "large" }) {
  const [location] = useLocation();
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {useNavItems(size === "large").map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          onClick={onNavigate}
          title={size === "icons" ? label : undefined}
          aria-current={location === href ? "page" : undefined}
          className={`flex items-center gap-2.5 rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:font-medium aria-[current=page]:text-foreground ${size === "large" ? "px-2.5 py-3 text-lg" : size === "icons" ? "justify-center py-2" : "px-2.5 py-1.5 text-sm"}`}
        >
          <Icon className={size === "large" ? "size-5" : "size-4"} />
          <span className={size === "icons" ? "sr-only" : undefined}>{label}</span>
        </Link>
      ))}
    </nav>
  );
}

/** On a phone, all navigation opens as one simple full-screen menu. */
function PhoneMenu() {
  const { user } = useMe();
  const [open, setOpen] = useState(false);
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
        <div className="flex-1 p-4">
          <NavLinks onNavigate={() => setOpen(false)} size="large" />
        </div>
        {user && <PhoneAccount user={user} />}
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
  const links = [["/about", "About"], ["/terms", "Terms"], ["/privacy", "Privacy"]];
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

const readRail = () => {
  try {
    return localStorage.getItem(RAIL_KEY) !== "closed";
  } catch {
    return true;
  }
};

/** The signed-in sidebar. It can shrink to a strip of icons, and remembers which you prefer. */
function Rail() {
  const [open, setOpen] = useState(readRail);
  const toggle = () => {
    setOpen(!open);
    try {
      localStorage.setItem(RAIL_KEY, open ? "closed" : "open");
    } catch {
      // The choice just won't outlast this page.
    }
  };
  return (
    <aside className={`sticky top-0 hidden h-svh shrink-0 flex-col border-r p-2 transition-[width] duration-150 md:flex ${open ? "w-56" : "w-14"}`}>
      <div className={`mb-3 flex gap-1 ${open ? "items-center" : "flex-col items-center"}`}>
        <Link href="/" aria-label="Skeletable" className={`flex h-10 items-center gap-2 font-medium tracking-tight ${open ? "px-1.5" : "justify-center"}`}>
          {open ? <BrandName /> : <Logo className="size-7" />}
        </Link>
        <Button variant="ghost" size="icon-sm" className={open ? "ml-auto" : undefined} onClick={toggle} aria-label={open ? "Collapse sidebar" : "Expand sidebar"} aria-expanded={open}>
          <PanelLeft />
        </Button>
      </div>
      <NavLinks size={open ? "normal" : "icons"} />
      <div className={`mt-auto flex border-t pt-2 ${open ? "" : "justify-center"}`}>
        <AccountButton wide={open} compact={!open} />
      </div>
    </aside>
  );
}

function SignedInFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-svh md:flex">
      <Rail />
      <div className="min-w-0 flex-1">
        <PhoneBar />
        {children}
        <Footer />
      </div>
    </div>
  );
}

function PublicFrame({ children }: { children: ReactNode }) {
  const items = useNavItems();
  return (
    <div className="min-h-svh">
      <PhoneBar />
      <header className={`${bar} hidden md:flex`}>
        <Brand />
        {items.map(({ href, label }) => (
          <Link key={href} href={href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">{label}</Link>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <AgentButton />
          <ThemeButton />
          <AccountButton />
        </div>
      </header>
      {children}
      <Footer />
    </div>
  );
}

/** The frame follows who you are, not which page you're on: a top bar in public, and the rail once signed in. */
export function Page({ children }: { children: ReactNode }) {
  const { user } = useMe();
  const [location] = useLocation();
  const page = <div key={location} className="duration-200 animate-in fade-in slide-in-from-bottom-1 motion-reduce:animate-none">{children}</div>;
  return user ? <SignedInFrame>{page}</SignedInFrame> : <PublicFrame>{page}</PublicFrame>;
}
