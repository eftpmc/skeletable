import { Home, Menu, Table2, X, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { AccountButton, AgentButton, Logo, ThemeButton } from "@/components/Chrome";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useJson, type Me } from "@/lib/api";

// Shared by every top bar and the phone menu, so the menu button and its X sit in the same spot.
const bar = "flex h-12 shrink-0 items-center gap-4 border-b px-4";

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

function useNavItems() {
  const { data } = useJson<Me>("/api/me");
  const items: { href: string; label: string; icon: LucideIcon }[] = [{ href: "/explore", label: "Browse tables", icon: Table2 }];
  return data?.user ? [{ href: "/", label: "Your tables", icon: Home }, ...items] : items;
}

function NavLinks({ onNavigate, large = false }: { onNavigate?: () => void; large?: boolean }) {
  const [location] = useLocation();
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {useNavItems().map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          onClick={onNavigate}
          aria-current={location === href ? "page" : undefined}
          className={`flex items-center gap-2.5 rounded-md px-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:font-medium aria-[current=page]:text-foreground ${large ? "py-3 text-lg" : "py-1.5 text-sm"}`}
        >
          <Icon className={large ? "size-5" : "size-4"} />
          {label}
        </Link>
      ))}
    </nav>
  );
}

/** On a phone, all navigation opens as one simple full-screen menu. */
function PhoneMenu() {
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
          <NavLinks onNavigate={() => setOpen(false)} large />
        </div>
        <div className="flex items-center gap-2 border-t p-4">
          <AgentButton label="Connect an agent" />
          <div className="ml-auto flex items-center gap-1">
            <ThemeButton />
            <AccountButton />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const PhoneBar = () => (
  <header className={`${bar} md:hidden`}>
    <Brand />
    <div className="ml-auto flex"><PhoneMenu /></div>
  </header>
);

/** The public side: a simple top bar over the page. */
export function PublicPage({ children }: { children: ReactNode }) {
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
    </div>
  );
}

/** The signed-in side: your own pages, with a sidebar that has room to grow. */
export function UserPage({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-svh md:flex">
      <aside className="sticky top-0 hidden h-svh w-56 shrink-0 flex-col border-r p-3 md:flex">
        <div className="mb-5 px-1.5 pt-1"><Brand /></div>
        <NavLinks />
        <div className="mt-auto flex items-center gap-1 border-t pt-3">
          <AgentButton />
          <ThemeButton />
          <div className="ml-auto"><AccountButton /></div>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <PhoneBar />
        {children}
      </div>
    </div>
  );
}
