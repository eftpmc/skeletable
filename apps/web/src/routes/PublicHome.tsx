import { Chip, ChipRow } from "@closet/ui";
import { Suspense, lazy } from "react";
import { useNavigate } from "react-router";
import { Landing } from "../components/Landing";
import { SearchBar } from "../components/SearchBar";
import { shortcutHref, shortcuts } from "../lib/shortcuts";

// The shader library is only needed here, so it loads with this screen.
const HalftoneArt = lazy(() => import("../components/HalftoneArt"));

/** The front door for signed-out visitors: the hero with the search, then what this is. */
export function PublicHome() {
  const navigate = useNavigate();

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
              <Chip key={s.label} variant="shortcut" onClick={() => navigate(shortcutHref(s))}>
                {s.label}
              </Chip>
            ))}
          </ChipRow>
        </div>
      </div>

      <Landing />
    </section>
  );
}
