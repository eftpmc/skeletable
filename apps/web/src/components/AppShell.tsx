import { BellIcon, BookmarkIcon, CompassIcon, CountPill, IconButton, MenuIcon, NavDrawer, PackageIcon, SearchIcon, SideNav, XIcon, cn, focusRing } from "@skeleton/ui";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router";
import { useUnreadAlerts } from "../lib/alerts";
import { AccountMenu } from "./AccountMenu";
import { SearchTrigger, useSearchPalette } from "./SearchPalette";

const tabs = [
  { to: "/discover", label: "Discover", icon: CompassIcon },
  { to: "/alerts", label: "Alerts", icon: BellIcon },
  { to: "/saved", label: "Saved", icon: BookmarkIcon },
  { to: "/collection", label: "Collection", icon: PackageIcon },
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

/**
 * Phones: search sits at the bottom, where thumbs are. It tucks away while you scroll down a page and
 * comes back when you scroll up. Product pages have their own bar there (Buy), so it steps aside.
 */
function BottomSearch() {
  const { open } = useSearchPalette();
  const { pathname, search } = useLocation();
  const [hidden, setHidden] = useState(false);
  const last = useRef(0);
  const q = pathname === "/search" ? (new URLSearchParams(search).get("q") ?? "") : "";

  useEffect(() => {
    function onScroll() {
      const y = window.scrollY;
      if (Math.abs(y - last.current) < 8) return;
      setHidden(y > last.current && y > 80);
      last.current = y;
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (pathname.startsWith("/p/")) return null;
  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-20 px-4 pb-[calc(12px+env(safe-area-inset-bottom))] transition-transform duration-300 lg:hidden",
        hidden && "translate-y-[calc(100%+8px)]",
      )}
    >
      <button
        type="button"
        onClick={() => open(q)}
        className={cn("flex h-14 w-full items-center gap-3 rounded-full bg-canvas px-4 text-left shadow-field", focusRing)}
      >
        <SearchIcon size={22} strokeWidth={2.4} className="shrink-0 text-ink" />
        <span className={cn("min-w-0 flex-1 truncate text-body", q ? "text-ink" : "text-muted")}>{q || "Search or paste a link"}</span>
      </button>
    </div>
  );
}

/** The bell at the top right of the wide-screen header: Alerts, with how many are new. */
function AlertsButton({ count }: { count: number }) {
  const { pathname } = useLocation();
  return (
    <Link
      to="/alerts"
      aria-label={count ? `Alerts, ${count} new` : "Alerts"}
      title="Alerts"
      aria-current={pathname.startsWith("/alerts") ? "page" : undefined}
      className={cn("relative inline-flex size-10 shrink-0 items-center justify-center rounded-full text-ink hover:bg-surface aria-[current=page]:bg-surface", focusRing)}
    >
      <BellIcon size={22} />
      {count > 0 && <CountPill count={count} className="absolute -top-0.5 -right-1" />}
    </Link>
  );
}

/** The same sidebar everywhere: beside the page on wide screens, in a drawer behind the menu button on narrow ones. */
export function AppShell({ user }: { user: User }) {
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const { data: unread = 0 } = useUnreadAlerts();

  // Navigating closes the drawer.
  useEffect(() => setMenuOpen(false), [pathname]);

  // Search lives in the header, so results and product pages belong to no tab; brand pages belong to Discover.
  const items = tabs.map(({ to, ...tab }) => ({
    ...tab,
    to,
    active: pathname.startsWith(to) || (to === "/discover" && pathname.startsWith("/brands/")),
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
        // Wide screens have the account at the top right instead.
        footer={inDrawer ? <AccountMenu user={user} onNavigate={close} /> : undefined}
      />
    );
  };

  return (
    <div className="flex min-h-full flex-col lg:h-dvh lg:flex-row lg:overflow-hidden lg:bg-surface">
      {sidebar("sticky top-0 hidden h-dvh lg:flex lg:border-r-0")}

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

      <div className="min-w-0 flex-1 lg:my-2 lg:mr-2 lg:overflow-y-auto lg:rounded-2xl lg:border lg:border-line lg:bg-canvas">
        {/* Wide screens: search on every page, in a bar above it, with alerts and the account at its end. */}
        <div className="sticky top-0 z-20 hidden border-b border-line bg-canvas/90 px-10 backdrop-blur lg:block">
          <div className="mx-auto flex h-[72px] max-w-6xl items-center gap-6">
            <SearchTrigger className="max-w-[640px]" />
            <div className="ml-auto flex shrink-0 items-center gap-1">
              <AlertsButton count={unread} />
              <AccountMenu user={user} compact />
            </div>
          </div>
        </div>
        <main className="px-4 pt-4 pb-28 lg:px-10 lg:pt-8 lg:pb-16">
          <div className="mx-auto w-full max-w-6xl">
            <Outlet context={{ user }} />
          </div>
        </main>
      </div>
      <BottomSearch />
    </div>
  );
}
