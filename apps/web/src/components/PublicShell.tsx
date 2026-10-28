import { cn, focusRing } from "@skeleton/ui";
import { Link, Outlet, useLocation } from "react-router";
import { useNextParam } from "../lib/viewer";
import { Wordmark } from "./AppShell";
import { SearchTrigger } from "./SearchPalette";

/**
 * Around search, results and products for signed-out visitors: the wordmark, and a way in.
 * Same bar height and gutters as the signed-in phone header, so signing in doesn't shift the page.
 * Off the front page (which has its own big search), the header carries the search box: beside the
 * wordmark on wide screens, in a row of its own on phones.
 */
export function PublicShell() {
  const next = useNextParam();
  const search = useLocation().pathname !== "/";

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/90 pt-[env(safe-area-inset-top)] backdrop-blur lg:px-10">
        {/* The wordmark's text lines up with the page content below. */}
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-1 px-2 lg:px-0">
          <Wordmark className="px-2 py-1 text-title-3 lg:-ml-2" />
          {search && <SearchTrigger className="ml-6 hidden max-w-[520px] lg:flex" />}
          <Link to={`/sign-in${next}`} className={cn("ml-auto rounded-full px-3 py-2 text-callout font-medium text-ink hover:bg-surface", focusRing)}>
            Sign in
          </Link>
          <Link
            to={`/sign-up${next}`}
            className={cn("inline-flex h-9 items-center rounded-full bg-ink px-4 text-callout font-semibold text-on-ink", focusRing)}
          >
            Get started
          </Link>
        </div>
        {search && (
          <div className="px-4 pb-2 lg:hidden">
            <SearchTrigger />
          </div>
        )}
      </header>

      <main className="min-w-0 flex-1 px-4 pt-4 pb-10 lg:px-10 lg:pt-6 lg:pb-16">
        <div className="mx-auto w-full max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
