import { Button, Chip, ChipRow, EmptyState, SectionHeader } from "@closet/ui";
import { useQuery } from "@tanstack/react-query";
import { Suspense, lazy } from "react";
import { Link, useNavigate } from "react-router";
import { SearchBar } from "../components/SearchBar";
import { api } from "../lib/api";

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
      <p className="mt-2 text-callout font-normal text-muted">Save a search and new matches show up here.</p>
    </section>
  );
}
