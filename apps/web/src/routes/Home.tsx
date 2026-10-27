import type { BrandCard as Brand, SavedSearchSummary, WatchSummary } from "@closet/shared";
import { CheckIcon, Chip, ChipRow, ChevronRightIcon, Halftone, ShopIcon, Skeleton, cn, focusRing } from "@closet/ui";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { brandMeta } from "../components/BrandCard";
import { searchDetail, searchHref, useSavedSearches, useWatches } from "../lib/alerts";
import { api } from "../lib/api";
import { useForYou, useStarters } from "../lib/catalog";
import { formatMoney } from "../lib/format";
import { useIsAdmin, useMe } from "../lib/me";
import { rememberSearch, useRecentSearches } from "../lib/recent";
import { shortcutHref, shortcuts } from "../lib/shortcuts";

/**
 * Signed in, home reads like a front page: the masthead with today's news and where to pick up,
 * then your list (drops and new matches) when there is one, then brands from the catalog, which is
 * never empty. The search box is in the header on every page, so this screen doesn't repeat it.
 */
export function Home() {
  const searches = useSavedSearches();
  const watches = useWatches();
  const forYou = useForYou();
  const starters = useStarters();
  const admin = useIsAdmin();
  const { data: sources = [] } = useQuery({ queryKey: ["sources"], queryFn: api.sources });
  const noSources = sources.length > 0 && !sources.some((s) => s.enabled);

  const drops = [...(watches.data ?? [])].filter((w) => w.dropCents > 0).sort((a, b) => b.dropCents - a.dropCents);
  // Searches with something new first; ones without photos have nothing to show here.
  const fresh = [...(searches.data ?? [])].sort((a, b) => b.newCount - a.newCount).filter((s) => s.images.length > 0);
  const newMatches = (searches.data ?? []).reduce((sum, s) => sum + s.newCount, 0);
  const loaded = !searches.isPending && !watches.isPending && !forYou.isPending;

  const likes = forYou.data?.likes ?? 0;
  const needed = forYou.data?.needed ?? 5;
  const steps = [
    { done: (searches.data?.length ?? 0) > 0, label: "Save a search" },
    { done: (watches.data?.length ?? 0) > 0, label: "Track a price" },
    { done: likes >= needed, label: likes > 0 && likes < needed ? `Like ${needed} brands · ${likes}/${needed}` : `Like ${needed} brands`, to: "/discover" },
  ];
  const settingUp = loaded && steps.some((s) => !s.done);

  const picks = forYou.data?.brands ?? [];
  const brands = (picks.length ? picks : (starters.data ?? [])).slice(0, 8);

  return (
    <section>
      <Masthead newMatches={newMatches} drops={drops.length} loaded={loaded} />

      {noSources && (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line px-4 py-3 text-callout">
          <ShopIcon size={18} className="shrink-0" />
          <span className="text-ink">Search has no stores yet.</span>
          <span className="text-muted">Pasting a product link still works.</span>
          {admin && (
            <Link to="/settings/stores" className={cn("ml-auto inline-flex items-center gap-0.5 rounded-full font-semibold text-ink", focusRing)}>
              Set up stores
              <ChevronRightIcon size={16} />
            </Link>
          )}
        </div>
      )}

      {settingUp && <SetupStrip steps={steps} />}

      {(drops.length > 0 || fresh.length > 0) && <YourList drops={drops} searches={fresh} />}

      <section aria-labelledby="catalog" className="mt-12">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <h2 id="catalog" className="text-title-2 text-ink">
              {picks.length ? "Picks for you" : "From the catalog"}
            </h2>
            <p className="mt-0.5 text-callout font-normal text-muted">
              {picks.length ? "Small brands close to the ones you liked." : "Small brands found across the open web. Like a few in Discover to get picks of your own."}
            </p>
          </div>
          <Link to="/discover" className={cn("shrink-0 rounded-full text-callout font-normal text-muted hover:text-ink", focusRing)}>
            Discover
          </Link>
        </div>
        {/* Phones: a row to swipe through. Wide screens: a grid of four. */}
        <div className="-mx-4 mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:grid lg:grid-cols-4 lg:gap-5 lg:overflow-visible lg:px-0">
          {brands.length
            ? brands.map((b) => <BrandTile key={b.id} brand={b} />)
            : [0, 1, 2, 3].map((i) => <Skeleton key={i} className="aspect-square w-[72%] shrink-0 rounded-xl lg:w-auto" />)}
        </div>
      </section>
    </section>
  );
}

/** The front page's paper and halftone, small: today's date, a greeting, the news, and where to pick up. */
function Masthead({ newMatches, drops, loaded }: { newMatches: number; drops: number; loaded: boolean }) {
  const navigate = useNavigate();
  const recent = useRecentSearches();
  const firstName = useMe().data?.name.split(" ")[0];
  return (
    <header className="relative overflow-hidden rounded-[24px] bg-[#f6f1e7] px-6 pt-6 pb-6 text-black lg:px-10 lg:pt-9 lg:pb-8">
      <Halftone corner="top-right" reach={62} />
      <p className="relative text-callout font-normal text-[#3a3a3c]">{today()}</p>
      <h1 className="relative mt-1 max-w-[16ch] text-[34px] leading-[1.02] font-extrabold tracking-[-0.04em] lg:text-[52px]">
        {greeting()}
        {firstName ? `, ${firstName}` : ""}.
      </h1>
      <p className="relative mt-3 max-w-xl text-body text-[#3a3a3c]">{headline(newMatches, drops, loaded)}</p>
      <div className="relative mt-6">
        <p className="text-footnote text-[#3a3a3c]">{recent.length ? "Pick up where you left off" : "Start with"}</p>
        <ChipRow className="mt-2 -mx-6 px-6 lg:mx-0 lg:flex-wrap lg:px-0">
          {recent.length
            ? recent.slice(0, 6).map((q) => (
                <Chip
                  key={q}
                  variant="shortcut"
                  onClick={() => {
                    rememberSearch(q);
                    navigate(`/search?q=${encodeURIComponent(q)}`);
                  }}
                >
                  {q}
                </Chip>
              ))
            : shortcuts.map((s) => (
                <Chip key={s.label} variant="shortcut" onClick={() => navigate(shortcutHref(s))}>
                  {s.label}
                </Chip>
              ))}
        </ChipRow>
      </div>
    </header>
  );
}

/** Getting going, in one line: three steps that tick themselves off. Gone once all three are done. */
function SetupStrip({ steps }: { steps: { done: boolean; label: string; to?: string }[] }) {
  return (
    <section aria-label="Getting started" className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl bg-surface px-4 py-3">
      <span className="text-callout font-semibold text-ink">Getting started</span>
      <ol className="flex flex-wrap gap-x-5 gap-y-2">
        {steps.map((step) => {
          const body = (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full",
                  step.done ? "bg-ink text-on-ink" : "border-[1.5px] border-muted/50",
                )}
              >
                {step.done && <CheckIcon size={12} strokeWidth={3.2} />}
              </span>
              <span className={cn(step.done ? "text-muted line-through" : "text-ink")}>{step.label}</span>
              {step.done && <span className="sr-only">(done)</span>}
            </>
          );
          return (
            <li key={step.label} className="text-callout">
              {step.to && !step.done ? (
                <Link to={step.to} className={cn("flex items-center gap-2 rounded-sm hover:underline", focusRing)}>
                  {body}
                </Link>
              ) : (
                <span className="flex items-center gap-2">{body}</span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/**
 * What changed on your list, laid out like a page: the biggest drop large, then new matches for
 * saved searches and the other drops around it.
 */
function YourList({ drops, searches }: { drops: WatchSummary[]; searches: SavedSearchSummary[] }) {
  const [lead, ...otherDrops] = drops;
  const tiles = [...searches.map((s) => ({ kind: "search" as const, s })), ...otherDrops.map((w) => ({ kind: "drop" as const, w }))].slice(0, lead ? 4 : 8);
  return (
    <section aria-labelledby="your-list" className="mt-10">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="your-list" className="text-title-2 text-ink">
          Your list
        </h2>
        <Link to="/alerts" className={cn("rounded-full text-callout font-normal text-muted hover:text-ink", focusRing)}>
          All alerts
        </Link>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5">
        {lead && <LeadDrop watch={lead} />}
        {tiles.map((t) =>
          t.kind === "search" ? (
            <Tile
              key={`s:${t.s.id}`}
              to={searchHref(t.s)}
              image={t.s.images[0]}
              tag={t.s.newCount > 0 ? `${t.s.newCount} new` : null}
              title={t.s.query}
              caption={searchDetail(t.s) || "Any price, any condition"}
            />
          ) : (
            <Tile
              key={`w:${t.w.productId}`}
              to={`/p/${t.w.productId}`}
              image={t.w.imageUrl}
              tag={`−${formatMoney(t.w.dropCents, t.w.currency)}`}
              title={t.w.title}
              caption={`Now ${formatMoney(t.w.currentPriceCents, t.w.currency)}`}
            />
          ),
        )}
        {/* An odd count leaves a hole in the grid: the last spot leads to everything instead. */}
        {tiles.length % 2 === 1 && (
          <Link
            to="/saved"
            className={cn("flex aspect-square flex-col justify-between rounded-xl border border-line p-4 text-ink hover:bg-surface", focusRing)}
          >
            <span className="text-title-3">Everything on your list</span>
            <span className="inline-flex items-center gap-1 text-callout font-normal text-muted">
              Saved and tracked
              <ChevronRightIcon size={16} />
            </span>
          </Link>
        )}
      </div>
    </section>
  );
}

function LeadDrop({ watch: w }: { watch: WatchSummary }) {
  return (
    <Link
      to={`/p/${w.productId}`}
      className={cn("group relative col-span-2 row-span-2 flex min-h-[320px] flex-col justify-end overflow-hidden rounded-[20px] bg-tile", focusRing)}
    >
      {w.imageUrl && (
        <img
          src={w.imageUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
      <div className="relative p-5 text-white lg:p-6">
        <span className="inline-flex rounded-full bg-white px-3 py-1 text-callout font-bold text-black tabular-nums">
          −{formatMoney(w.dropCents, w.currency)}
        </span>
        <p className="mt-3 line-clamp-2 text-title-2">{w.title}</p>
        <p className="mt-1 text-callout font-normal text-white/80">
          Now {formatMoney(w.currentPriceCents, w.currency)}
          {w.savedPriceCents ? `, was ${formatMoney(w.savedPriceCents, w.currency)}` : ""}
        </p>
      </div>
    </Link>
  );
}

function Tile({ to, image, tag, title, caption }: { to: string; image: string | null | undefined; tag: string | null; title: string; caption: string }) {
  return (
    <Link to={to} className={cn("group flex min-w-0 flex-col gap-2.5 rounded-xl", focusRing)}>
      <div className="relative overflow-hidden rounded-xl bg-tile">
        {image ? (
          <img src={image} alt="" referrerPolicy="no-referrer" className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        ) : (
          <div className="aspect-square" />
        )}
        {tag && <span className="absolute top-2.5 left-2.5 rounded-full bg-ink px-2 py-0.5 text-label text-on-ink tabular-nums">{tag}</span>}
      </div>
      <div className="px-0.5">
        <div className="line-clamp-1 text-callout font-semibold text-ink">{title}</div>
        <div className="line-clamp-1 text-footnote text-muted">{caption}</div>
      </div>
    </Link>
  );
}

/** A brand as a small printed spread: one big photo, three small, its name and where it's from. */
function BrandTile({ brand: b }: { brand: Brand }) {
  const [hero, ...rest] = b.photos;
  return (
    <Link to={`/brands/${b.id}`} className={cn("group flex w-[72%] shrink-0 snap-start flex-col gap-2.5 rounded-xl sm:w-[44%] lg:w-auto", focusRing)}>
      <div className="grid grid-cols-3 grid-rows-[1fr_auto] gap-1 overflow-hidden rounded-xl">
        <div className="col-span-3 overflow-hidden bg-tile">
          {hero && (
            <img src={hero} alt="" loading="lazy" referrerPolicy="no-referrer" className="aspect-[4/3] w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
          )}
        </div>
        {[0, 1, 2].map((i) =>
          rest[i] ? (
            <img key={i} src={rest[i]} alt="" loading="lazy" referrerPolicy="no-referrer" className="aspect-square w-full bg-tile object-cover" />
          ) : (
            <div key={i} className="aspect-square bg-tile" />
          ),
        )}
      </div>
      <div className="px-0.5">
        <div className="line-clamp-1 text-callout font-semibold text-ink">{b.name}</div>
        <div className="line-clamp-1 text-footnote text-muted">{brandMeta(b)}</div>
      </div>
    </Link>
  );
}

const today = () => new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

function greeting() {
  const hour = new Date().getHours();
  return hour < 5 ? "Good evening" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

/** One line on what's new, the way a front page leads with its news. */
function headline(matches: number, drops: number, loaded: boolean) {
  if (!loaded) return " ";
  const parts = [
    matches > 0 ? `${matches} new ${matches === 1 ? "match" : "matches"} for your alerts` : null,
    drops > 0 ? `${drops} ${drops === 1 ? "price" : "prices"} dropped on your list` : null,
  ].filter(Boolean);
  return parts.length ? `${parts.join(", and ")}.` : "Nothing new yet. Here's what's turned up in the catalog.";
}
