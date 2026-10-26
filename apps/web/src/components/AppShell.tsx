import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet } from "react-router";
import { signOut } from "../lib/auth-client";
import { BellIcon, BookmarkIcon, PackageIcon, SearchIcon } from "./icons";

const tabs = [
  { to: "/", label: "Search", Icon: SearchIcon, end: true },
  { to: "/alerts", label: "Alerts", Icon: BellIcon, end: false },
  { to: "/saved", label: "Saved", Icon: BookmarkIcon, end: false },
  { to: "/owned", label: "Owned", Icon: PackageIcon, end: false },
];

type User = { name: string; email: string; image?: string | null };

export function AppShell({ user }: { user: User }) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 hidden border-b border-line bg-canvas/90 backdrop-blur md:block">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link to="/" className="text-lg font-bold tracking-tight">
            search
          </Link>
          <nav className="flex gap-1">
            {tabs.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `rounded-full px-4 py-1.5 text-sm transition-colors ${
                    isActive ? "bg-ink text-canvas" : "text-muted hover:text-ink"
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <AccountMenu user={user} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-4 pb-28 md:px-6 md:pt-8 md:pb-12">
        <Outlet context={{ user }} />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-canvas/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-md justify-around">
          {tabs.map(({ to, label, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              aria-label={label}
              className={({ isActive }) =>
                `flex h-14 flex-1 items-center justify-center ${isActive ? "text-ink" : "text-muted"}`
              }
            >
              {({ isActive }) => <Icon size={26} strokeWidth={isActive ? 2.6 : 1.8} />}
            </NavLink>
          ))}
        </div>
      </nav>
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

  const initial = (user.name || user.email).charAt(0).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Account"
        onClick={() => setOpen((value) => !value)}
        className="flex size-10 items-center justify-center overflow-hidden rounded-full bg-surface text-sm font-medium"
      >
        {user.image ? <img src={user.image} alt="" className="size-full object-cover" /> : initial}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-60 rounded-2xl border border-line bg-canvas p-2 shadow-xl">
          <div className="px-3 py-2">
            <div className="truncate text-sm font-medium">{user.name}</div>
            <div className="truncate text-xs text-muted">{user.email}</div>
          </div>
          <div className="my-1 h-px bg-line" />
          <Link
            to="/profile"
            onClick={() => setOpen(false)}
            className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-surface"
          >
            Profile, sizes &amp; stores
          </Link>
          <button
            type="button"
            onClick={() => void signOut()}
            className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-surface"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
