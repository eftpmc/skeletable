import { Avatar, BellIcon, BookmarkIcon, IconButton, MenuIcon, NavDrawer, PackageIcon, SearchIcon, SideNav, cn, focusRing } from "@closet/ui";
import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router";

const tabs = [
  { to: "/", label: "Search", icon: SearchIcon, end: true },
  { to: "/alerts", label: "Alerts", icon: BellIcon, end: false },
  { to: "/saved", label: "Saved", icon: BookmarkIcon, end: false },
  { to: "/owned", label: "Owned", icon: PackageIcon, end: false },
];

type User = { name: string; email: string; image?: string | null };

function Wordmark({ className, onClick }: { className?: string; onClick?: () => void }) {
  return (
    <Link to="/" onClick={onClick} className={cn("rounded-sm px-3 py-2 text-title-2 font-extrabold tracking-[-0.03em] text-ink", focusRing, className)}>
      skeleton
    </Link>
  );
}

/** The same sidebar everywhere: beside the page on wide screens, in a drawer behind the menu button on narrow ones. */
export function AppShell({ user }: { user: User }) {
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Navigating closes the drawer.
  useEffect(() => setMenuOpen(false), [pathname]);

  // Results and product pages belong to Search.
  const items = tabs.map(({ to, end, ...tab }) => ({
    ...tab,
    to,
    active: end ? pathname === "/" || pathname.startsWith("/search") || pathname.startsWith("/p/") : pathname.startsWith(to),
  }));

  const sidebar = (className: string, inDrawer = false) => {
    const close = inDrawer ? () => setMenuOpen(false) : undefined;
    return (
      <SideNav
        as={Link}
        items={items.map((item) => ({ ...item, onClick: close }))}
        className={className}
        brand={<Wordmark onClick={close} className="self-start" />}
        footer={
          <Link
            to="/profile"
            onClick={close}
            aria-current={pathname.startsWith("/profile") ? "page" : undefined}
            className={cn("flex h-[52px] items-center gap-3 rounded-lg px-3 hover:bg-surface aria-[current=page]:bg-surface", focusRing)}
          >
            <Avatar name={user.name || user.email} image={user.image} size={32} />
            <span className="min-w-0">
              <span className="block truncate text-callout font-semibold text-ink">{user.name || user.email}</span>
              <span className="block text-footnote text-muted">Profile &amp; settings</span>
            </span>
          </Link>
        }
      />
    );
  };

  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      {sidebar("sticky top-0 hidden h-dvh lg:flex")}

      <header className="sticky top-0 z-20 flex h-14 items-center gap-1 border-b border-line bg-canvas/90 px-2 backdrop-blur lg:hidden">
        <IconButton label="Menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
          <MenuIcon size={22} />
        </IconButton>
        <Wordmark className="px-1 py-1 text-title-3 font-extrabold" />
      </header>
      <NavDrawer open={menuOpen} onOpenChange={setMenuOpen}>
        {sidebar("h-full w-full border-r-0 px-3 py-2", true)}
      </NavDrawer>

      <main className="min-w-0 flex-1 px-4 pt-4 pb-10 lg:px-10 lg:pt-6 lg:pb-16">
        <div className="mx-auto w-full max-w-6xl">
          <Outlet context={{ user }} />
        </div>
      </main>
    </div>
  );
}
