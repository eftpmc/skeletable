import { Badge, Button, Chip, ChipRow, EmptyState, ProductTile, SectionHeader, cn, focusRing } from "@closet/ui";
import { useQuery } from "@tanstack/react-query";
import { Suspense, lazy } from "react";
import { Link, useNavigate } from "react-router";
import { SearchBar } from "../components/SearchBar";
import { searchDetail, searchHref, useSavedSearches, useWatches } from "../lib/alerts";
import { api } from "../lib/api";
import { formatMoney } from "../lib/format";

// The shader library is only needed here, so it loads with this screen.
const HalftoneArt = lazy(() => import("../components/HalftoneArt"));

const shortcuts = [
  { label: "Sneakers", q: "sneakers" },
  { label: "Headphones", q: "headphones" },
  { label: "Tech", q: "laptop" },
  { label: "Home", q: "sofa" },
  { label: "Used & refurb", q: "iphone", condition: "used" },
];

export function SearchHome() {
  const navigate = useNavigate();
  const { data: sources = [] } = useQuery({ queryKey: ["sources"], queryFn: api.sources });
  const noSources = sources.length > 0 && !sources.some((s) => s.enabled);
  const { data: searches = [] } = useSavedSearches();
  const { data: watches = [] } = useWatches();
  // Searches with something new first, then the rest, so the row is never empty once you've saved one.
  const alertCards = [...searches].sort((a, b) => b.newCount - a.newCount).filter((s) => s.images.length > 0).slice(0, 4);
  const drops = watches.filter((w) => w.dropCents > 0).slice(0, 5);

  return (
    <section>
      {/* The hero is a printed piece: paper and black type in light and dark mode alike. */}
      <div className="relative overflow-hidden rounded-[28px] bg-[#f6f1e7] text-black lg:flex lg:min-h-[600px] lg:items-center">
        <div className="relative h-56 lg:absolute lg:inset-0 lg:h-auto">
          <Suspense fallback={null}>
            <HalftoneArt />
          </Suspense>
        </div>
        <div className="relative flex flex-col gap-6 px-5 pt-2 pb-6 lg:max-w-[780px] lg:px-14 lg:py-16">
          <h1 className="text-[40px] leading-[0.98] font-extrabold tracking-[-0.045em] lg:text-[72px]">
            Find anything,
            <br />
            from every store.
          </h1>
          <p className="-mt-1 max-w-[460px] text-[17px] leading-snug text-[#3a3a3c] lg:text-lg">
            New, used and refurbished, side by side, with a straight answer on whether the price is good.
          </p>
          <div className="max-w-[600px]">
            <SearchBar autoFocus />
          </div>
          <ChipRow className="lg:mx-0 lg:flex-wrap lg:px-0">
            {shortcuts.map((s) => (
              <Chip
                key={s.label}
                variant="shortcut"
                onClick={() => navigate(`/search?q=${encodeURIComponent(s.q)}${s.condition ? `&condition=${s.condition}` : ""}`)}
              >
                {s.label}
              </Chip>
            ))}
          </ChipRow>
        </div>
      </div>

      {noSources && (
        <EmptyState
          className="mt-8"
          title="No stores connected yet"
          body="Pasting a product link works now. To search by name, add Shopify stores or free eBay and Best Buy keys."
          action={<Button onClick={() => navigate("/profile")}>Connect stores</Button>}
        />
      )}

      <SectionHeader className="mt-12" title="New for your alerts" action={{ label: "See all", as: Link, to: "/alerts" }} />
      {alertCards.length === 0 ? (
        <p className="mt-2 text-callout font-normal text-muted">Save a search and new matches show up here.</p>
      ) : (
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
    </section>
  );
}
