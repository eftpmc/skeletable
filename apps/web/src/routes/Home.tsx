import { Badge, Button, CheckIcon, Chip, ChipRow, EmptyState, ProductTile, ScreenTitle, SectionHeader, cn, focusRing } from "@closet/ui";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { BrandCard, BrandGrid } from "../components/BrandCard";
import { searchDetail, searchHref, useSavedSearches, useWatches } from "../lib/alerts";
import { api } from "../lib/api";
import { useForYou } from "../lib/catalog";
import { formatMoney } from "../lib/format";
import { clearRecentSearches, rememberSearch, useRecentSearches } from "../lib/recent";
import { useIsAdmin } from "../lib/me";
import { shortcutHref, shortcuts } from "../lib/shortcuts";

/**
 * Signed in, home is what changed since you were last here: new alert matches, drops on your list,
 * brand picks. The search box is in the header on every page, so this screen doesn't repeat it.
 */
export function Home() {
  const navigate = useNavigate();
  const recent = useRecentSearches();
  const admin = useIsAdmin();
  const { data: sources = [] } = useQuery({ queryKey: ["sources"], queryFn: api.sources });
  const noSources = sources.length > 0 && !sources.some((s) => s.enabled);
  const searches = useSavedSearches();
  const watches = useWatches();
  const forYou = useForYou();

  // Searches with something new first, then the rest, so the row is never empty once you've saved one.
  const alertCards = [...(searches.data ?? [])].sort((a, b) => b.newCount - a.newCount).filter((s) => s.images.length > 0).slice(0, 4);
  const drops = (watches.data ?? []).filter((w) => w.dropCents > 0).slice(0, 5);
  const picks = forYou.data?.brands.slice(0, 3) ?? [];
  const likes = forYou.data?.likes ?? 0;
  const needed = forYou.data?.needed ?? 5;

  const loaded = !searches.isPending && !watches.isPending && !forYou.isPending;
  const steps = [
    { done: (searches.data?.length ?? 0) > 0, title: "Save a search", body: "Search for something, then tap Save search. New matches show up here." },
    { done: (watches.data?.length ?? 0) > 0, title: "Track a price", body: "Open a product and tap Track price to hear when it drops." },
    {
      done: likes >= needed,
      title: `Like ${needed} brands`,
      body: likes > 0 ? `${likes} of ${needed} so far. Your picks start after that.` : "Discover learns your taste and picks small brands for you.",
      to: "/discover",
    },
  ];
  const settingUp = loaded && steps.some((s) => !s.done);

  return (
    <section>
      <ScreenTitle className="lg:text-[40px] lg:leading-[44px]">Home</ScreenTitle>

      <div className="mt-5 flex items-baseline justify-between gap-4">
        <h2 className="text-section-label text-muted uppercase">{recent.length > 0 ? "Recent searches" : "Try a search"}</h2>
        {recent.length > 0 && (
          <button type="button" onClick={clearRecentSearches} className={cn("rounded-full text-footnote text-muted hover:text-ink", focusRing)}>
            Clear
          </button>
        )}
      </div>
      <ChipRow className="mt-1 lg:mx-0 lg:flex-wrap lg:px-0">
        {recent.length > 0
          ? recent.map((q) => (
              <Chip
                key={q}
                onClick={() => {
                  rememberSearch(q);
                  navigate(`/search?q=${encodeURIComponent(q)}`);
                }}
              >
                {q}
              </Chip>
            ))
          : shortcuts.map((s) => (
              <Chip key={s.label} onClick={() => navigate(shortcutHref(s))}>
                {s.label}
              </Chip>
            ))}
      </ChipRow>

      {noSources && (
        <EmptyState
          className="mt-8"
          title="No stores connected yet"
          body={
            admin
              ? "Pasting a product link works now. To search by name, add Shopify stores or free eBay and Best Buy keys."
              : "Pasting a product link works now. Searching by name starts once this server's owner adds stores."
          }
          action={admin ? <Button onClick={() => navigate("/settings/stores")}>Set up stores</Button> : undefined}
        />
      )}

      {settingUp && (
        <section aria-labelledby="get-started" className="mt-10 rounded-xl bg-surface p-5 lg:p-6">
          <h2 id="get-started" className="text-title-3 text-ink">
            Get started
          </h2>
          <ol className="mt-4 grid gap-4 sm:grid-cols-3">
            {steps.map((step) => (
              <Step key={step.title} done={step.done} title={step.title} to={step.to}>
                {step.body}
              </Step>
            ))}
          </ol>
        </section>
      )}

      {alertCards.length > 0 && (
        <>
          <SectionHeader className="mt-12" title="New for your alerts" action={{ label: "See all", as: Link, to: "/alerts" }} />
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5">
            {alertCards.map((s) => (
              <Link key={s.id} to={searchHref(s)} className={cn("group flex flex-col gap-2.5 rounded-xl", focusRing)}>
                <div className="relative overflow-hidden rounded-xl bg-tile">
                  <img
                    src={s.images[0]}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                  {s.newCount > 0 && <Badge className="absolute top-2.5 left-2.5">{s.newCount} new</Badge>}
                </div>
                <div className="px-0.5">
                  <div className="line-clamp-1 text-callout font-semibold text-ink">{s.query}</div>
                  <div className="line-clamp-1 text-footnote text-muted">{searchDetail(s) || "Any price, any condition"}</div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {drops.length > 0 && (
        <>
          <SectionHeader className="mt-12" title="Dropped on your list" action={{ label: "See all", as: Link, to: "/saved" }} />
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 lg:gap-4">
            {drops.map((w) => (
              <ProductTile
                key={w.productId}
                as={Link}
                to={`/p/${w.productId}`}
                image={w.imageUrl}
                alt={w.title}
                price={formatMoney(w.currentPriceCents, w.currency) ?? ""}
                badge={{ text: `−${formatMoney(w.dropCents, w.currency)}` }}
                title={w.title}
              />
            ))}
          </div>
        </>
      )}

      {picks.length > 0 && (
        <>
          <SectionHeader className="mt-12" title="Picks for you" action={{ label: "Discover", as: Link, to: "/discover" }} />
          <BrandGrid className="mt-4">
            {picks.map((b, i) => (
              <BrandCard key={b.id} brand={b} context="home" rank={i + 1} />
            ))}
          </BrandGrid>
        </>
      )}

      {loaded && !settingUp && alertCards.length === 0 && drops.length === 0 && picks.length === 0 && (
        <p className="mt-12 text-callout font-normal text-muted">Nothing new since your last visit. New matches and price drops show up here.</p>
      )}
    </section>
  );
}

function Step({ done, title, to, children }: { done: boolean; title: string; to?: string; children: ReactNode }) {
  const heading = (
    <span className="flex items-center gap-2 text-callout font-semibold text-ink">
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full border",
          done ? "border-ink bg-ink text-on-ink" : "border-line bg-canvas",
        )}
      >
        {done && <CheckIcon size={14} strokeWidth={3} />}
      </span>
      <span className={cn(done && "text-muted line-through")}>{title}</span>
      {done && <span className="sr-only">(done)</span>}
    </span>
  );
  return (
    <li>
      {to && !done ? (
        <Link to={to} className={cn("rounded-sm hover:underline", focusRing)}>
          {heading}
        </Link>
      ) : (
        heading
      )}
      <p className="mt-1 pl-8 text-footnote text-muted">{children}</p>
    </li>
  );
}
