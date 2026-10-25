import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { signOut } from "../lib/auth-client";
import { useAddItem } from "./AddItem";
import { ClosetIcon, DiscoverIcon, PlusIcon, SavedIcon } from "./icons";

const tabs = [
  { to: "/discover", label: "Discover", Icon: DiscoverIcon },
  { to: "/closet", label: "Closet", Icon: ClosetIcon },
  { to: "/saved", label: "Saved", Icon: SavedIcon },
];

type User = { name: string; email: string; image?: string | null };

export function AppShell({ user }: { user: User }) {
  const openAdd = useAddItem();
  // The add button belongs to the main tabs, not detail pages where it would cover content.
  const { pathname } = useLocation();
  const showAdd = tabs.some((tab) => tab.to === pathname);
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <span className="text-lg font-semibold tracking-tight">closet</span>
          <nav className="hidden gap-1 md:flex">
            {tabs.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
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

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-28 md:pb-10">
        <Outlet />
      </main>

      {showAdd && (
        <button
          type="button"
          aria-label="Add"
          onClick={openAdd}
          className="fixed right-5 bottom-24 z-30 flex size-14 items-center justify-center rounded-full bg-ink text-canvas shadow-lg transition-transform hover:scale-105 active:scale-95 md:bottom-8"
        >
          <PlusIcon />
        </button>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-canvas/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-md justify-around">
          {tabs.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] ${isActive ? "text-ink" : "text-muted"}`
              }
            >
              <Icon />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

function AccountMenu({ user }: { user: User }) {
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
        className="flex size-9 items-center justify-center overflow-hidden rounded-full bg-surface text-sm font-medium ring-1 ring-line"
      >
        {user.image ? <img src={user.image} alt="" className="size-full object-cover" /> : initial}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-60 rounded-2xl border border-line bg-surface p-2 shadow-xl">
          <div className="px-3 py-2">
            <div className="truncate text-sm font-medium">{user.name}</div>
            <div className="truncate text-xs text-muted">{user.email}</div>
          </div>
          <div className="my-1 h-px bg-line" />
          <Link
            to="/profile"
            onClick={() => setOpen(false)}
            className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-canvas"
          >
            Profile &amp; sizes
          </Link>
          <button
            type="button"
            onClick={() => void signOut()}
            className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-canvas"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
