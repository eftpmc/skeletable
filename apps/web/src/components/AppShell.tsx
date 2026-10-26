import { Avatar, BellIcon, BookmarkIcon, CompassIcon, IconButton, MenuIcon, NavDrawer, PackageIcon, SearchIcon, SideNav, XIcon, cn, focusRing } from "@closet/ui";
import { type ReactNode, useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router";
import { useUnreadAlerts } from "../lib/alerts";

const tabs = [
  { to: "/", label: "Search", icon: SearchIcon, end: true },
  { to: "/discover", label: "Discover", icon: CompassIcon, end: false },
  { to: "/alerts", label: "Alerts", icon: BellIcon, end: false },
  { to: "/saved", label: "Saved", icon: BookmarkIcon, end: false },
  { to: "/collection", label: "Collection", icon: PackageIcon, end: false },
];

type User = { name: string; email: string; image?: string | null };

export function Wordmark({ className, onClick }: { className?: string; onClick?: () => void }) {
  return (
    <Link to="/" onClick={onClick} className={cn("rounded-sm font-extrabold tracking-[-0.03em] text-ink", focusRing, className)}>
      skeleton
    </Link>
  );
}

/**
 * The narrow-screen top bar. The page header and the open drawer both use it, so opening the menu
 * only turns the menu button into a close button; nothing else moves.
 */
function TopBar({ button, onNavigate }: { button: ReactNode; onNavigate?: () => void }) {
  return (
    <div className="box-content flex h-14 items-center border-b border-line px-2 pt-[env(safe-area-inset-top)]">
      {button}
      <Wordmark onClick={onNavigate} className="px-0.5 py-1 text-title-3" />
    </div>
  );
}

/** The same sidebar everywhere: beside the page on wide screens, in a drawer behind the menu button on narrow ones. */
export function AppShell({ user }: { user: User }) {
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const { data: unread = 0 } = useUnreadAlerts();

  // Navigating closes the drawer.
  useEffect(() => setMenuOpen(false), [pathname]);

  // Results and product pages belong to Search; brand pages to Discover.
  const items = tabs.map(({ to, end, ...tab }) => ({
    ...tab,
    to,
    active: end
      ? pathname === "/" || pathname.startsWith("/search") || pathname.startsWith("/p/")
      : pathname.startsWith(to) || (to === "/discover" && pathname.startsWith("/brands/")),
    count: to === "/alerts" ? unread : undefined,
  }));

  const sidebar = (className?: string, inDrawer = false) => {
    const close = inDrawer ? () => setMenuOpen(false) : undefined;
    return (
      <SideNav
        as={Link}
        items={items.map((item) => ({ ...item, onClick: close }))}
        inDrawer={inDrawer}
        className={className}
        brand={inDrawer ? undefined : <Wordmark className="self-start px-3 py-2 text-title-2" />}
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

      <header className="sticky top-0 z-20 bg-canvas/90 backdrop-blur lg:hidden">
        <TopBar
          button={
            <IconButton label="Menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
              <MenuIcon size={22} />
            </IconButton>
          }
        />
      </header>
      <NavDrawer open={menuOpen} onOpenChange={setMenuOpen}>
        <TopBar
          onNavigate={() => setMenuOpen(false)}
          button={
            <IconButton label="Close menu" onClick={() => setMenuOpen(false)}>
              <XIcon size={22} />
            </IconButton>
          }
        />
        {sidebar(undefined, true)}
      </NavDrawer>

      <main className="min-w-0 flex-1 px-4 pt-4 pb-10 lg:px-10 lg:pt-6 lg:pb-16">
        <div className="mx-auto w-full max-w-6xl">
          <Outlet context={{ user }} />
        </div>
      </main>
    </div>
  );
}
