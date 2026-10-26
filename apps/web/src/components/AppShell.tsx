import { Avatar, BellIcon, BookmarkIcon, NavPills, PackageIcon, SearchIcon, TabBar, cn, focusRing } from "@closet/ui";
import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router";
import { signOut } from "../lib/auth-client";

const tabs = [
  { to: "/", label: "Search", icon: SearchIcon, end: true },
  { to: "/alerts", label: "Alerts", icon: BellIcon, end: false },
  { to: "/saved", label: "Saved", icon: BookmarkIcon, end: false },
  { to: "/owned", label: "Owned", icon: PackageIcon, end: false },
];

type User = { name: string; email: string; image?: string | null };

export function AppShell({ user }: { user: User }) {
  const { pathname } = useLocation();
  // Results and product pages belong to the Search tab.
  const items = tabs.map(({ to, end, ...tab }) => ({
    ...tab,
    to,
    active: end ? pathname === "/" || pathname.startsWith("/search") || pathname.startsWith("/p/") : pathname.startsWith(to),
  }));

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 hidden border-b border-line bg-canvas/90 backdrop-blur md:block">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link to="/" className={cn("rounded-sm text-title-3 text-ink", focusRing)}>
            search
          </Link>
          <NavPills as={Link} items={items} />
          <AccountMenu user={user} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-4 pb-28 md:px-6 md:pt-8 md:pb-12">
        <Outlet context={{ user }} />
      </main>

      <TabBar as={Link} items={items} className="fixed inset-x-0 bottom-0 z-20 md:hidden" />
    </div>
  );
}

export function AccountMenu({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button type="button" aria-label="Account" aria-expanded={open} onClick={() => setOpen((value) => !value)} className={cn("rounded-full", focusRing)}>
        <Avatar name={user.name || user.email} image={user.image} />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-60 rounded-xl bg-canvas p-2 shadow-field">
          <div className="px-3 py-2">
            <div className="truncate text-callout text-ink">{user.name}</div>
            <div className="truncate text-footnote text-muted">{user.email}</div>
          </div>
          <div className="my-1 h-px bg-line" />
          <Link to="/profile" onClick={() => setOpen(false)} className="block w-full rounded-md px-3 py-2 text-left text-callout font-normal hover:bg-surface">
            Profile, sizes &amp; stores
          </Link>
          <button type="button" onClick={() => void signOut()} className="w-full rounded-md px-3 py-2 text-left text-callout font-normal hover:bg-surface">
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
