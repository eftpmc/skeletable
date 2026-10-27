import { type Condition, type ResultCard, conditionLabels, conditions } from "@closet/shared";
import { BellIcon, CheckIcon, ChevronDownIcon, EmptyState, Menu, MenuChoices, ProductTile, Skeleton, TileGrid, cn, focusRing } from "@closet/ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import { ProductPeek, ProductSheet } from "../components/ProductPeek";
import { useWide } from "../lib/media";
import { useSavedSearch } from "../lib/alerts";
import { api } from "../lib/api";
import { formatMoney } from "../lib/format";

const prices = [50, 100, 250, 500];
const sorts = { best: "Best match", price: "Lowest price" } as const;
type Sort = keyof typeof sorts;


export function ResultsPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const condition = (params.get("condition") as Condition | null) ?? undefined;
  const max = params.get("max") ? Number(params.get("max")) : undefined;
  const sort: Sort = params.get("sort") === "price" ? "price" : "best";
  // Wide screens open products beside the results; phones in a sheet over them.
  const isWide = useWide();
  const peek = params.get("p");
  const location = useLocation();
  const navigate = useNavigate();
  // Opening a product adds a history entry, so Back (or the phone's back swipe) closes it.
  const openedHere = (location.state as { peek?: boolean } | null)?.peek === true;

  const { data, isPending, isError } = useQuery({
    queryKey: ["search", q, condition, max],
    queryFn: () => api.search({ q, condition, max }),
    enabled: q.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const saved = useSavedSearch(q, condition, max);
  const savedId = saved.saved?.id;
  const hasNew = (saved.saved?.newCount ?? 0) > 0;
  const { markViewed } = saved;
  // Looking at a saved search's results means nothing in it is new any more.
  useEffect(() => {
    if (data && savedId && hasNew) markViewed(savedId);
  }, [data, savedId, hasNew, markViewed]);

  const saveButton = (className?: string) => (
    <button
      type="button"
      aria-pressed={saved.saved !== null}
      disabled={saved.pending || !q}
      onClick={saved.toggle}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-callout transition-colors disabled:opacity-60",
        saved.saved ? "bg-ink font-medium text-on-ink" : "bg-surface font-normal text-ink",
        focusRing,
        className,
      )}
    >
      {saved.saved ? <CheckIcon size={16} /> : <BellIcon size={16} />}
      {saved.saved ? "Saved · alerts on" : "Save search"}
    </button>
  );

  const set = (key: string, value: string | undefined, push = false) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, push ? { state: { peek: true } } : { replace: true, state: location.state });
  };
  const open = (id: string) => set("p", id, !peek);
  const close = () => (openedHere ? navigate(-1) : set("p", undefined));

  const results = data ? (sort === "price" ? [...data.results].sort((a, b) => a.best.priceCents - b.best.priceCents) : data.results) : [];
  const peekIndex = peek ? results.findIndex((card) => card.productId === peek) : -1;
  const step = (by: 1 | -1) => {
    if (results.length === 0) return;
    set("p", results[(Math.max(peekIndex, 0) + by + results.length) % results.length]!.productId);
  };

  // Focus follows the open product, so only one tile looks picked and the grid scrolls along with the panel.
  useEffect(() => {
    if (!peek || !isWide) return;
    const tile = document.querySelector<HTMLElement>('[aria-current="true"]');
    // Only when focus is already on a tile (you clicked one); never pull it out of the panel.
    if (tile && document.activeElement !== tile && tile.parentElement?.contains(document.activeElement)) {
      tile.focus({ preventScroll: true });
      tile.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [peek, isWide]);

  // With a product open beside the results: arrows step through them, Escape closes it.
  useEffect(() => {
    if (!peek || !isWide) return;
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (document.querySelector("[role=dialog]")) return;
      if (event.key === "ArrowRight" || event.key === "ArrowDown" || event.key === "j") step(1);
      else if (event.key === "ArrowLeft" || event.key === "ArrowUp" || event.key === "k") step(-1);
      else if (event.key === "Escape") close();
      else return;
      event.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const failed = data?.sources.filter((s) => s.status !== "ok") ?? [];

  const filtered = Boolean(condition || max);

  return (
    <section>
      <header className="px-1">
        <h1 className="truncate text-title-1 text-ink lg:text-[34px] lg:leading-[38px]">{q}</h1>
        <p className="mt-1 h-5 text-callout font-normal text-muted">
          {data && results.length > 0 && (
            <>
              {results.length.toLocaleString()} {results.length === 1 ? "result" : "results"} · {data.total.toLocaleString()}{" "}
              {data.total === 1 ? "offer" : "offers"} from {data.storeCount} {data.storeCount === 1 ? "store" : "stores"}
            </>
          )}
        </p>
      </header>

      {/* One filter bar on every screen: each filter is a pill that opens its choices. It stays in view while you scroll. */}
      <div className="sticky top-[calc(56px+env(safe-area-inset-top))] z-10 -mx-4 mt-3 bg-canvas px-4 py-2 lg:top-[72px] lg:mx-0 lg:px-0">
        <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:px-0">
          <FilterPill
            label="Condition"
            value={condition ?? ""}
            onChange={(value) => set("condition", value || undefined)}
            options={[{ value: "", label: "Any condition" }, ...conditions.map((c) => ({ value: c, label: conditionLabels[c] }))]}
          />
          <FilterPill
            label="Price"
            value={max ? String(max) : ""}
            onChange={(value) => set("max", value || undefined)}
            options={[{ value: "", label: "Any price" }, ...prices.map((p) => ({ value: String(p), label: `Under $${p}` }))]}
          />
          <FilterPill
            label="Sort"
            value={sort}
            neutral
            onChange={(value) => set("sort", value === "best" ? undefined : value)}
            options={(Object.keys(sorts) as Sort[]).map((key) => ({ value: key, label: sorts[key] }))}
          />
          {filtered && (
            <button
              type="button"
              onClick={() => {
                const next = new URLSearchParams(params);
                next.delete("condition");
                next.delete("max");
                setParams(next, { replace: true, state: location.state });
              }}
              className={cn("h-9 shrink-0 rounded-full px-2 text-callout font-normal text-muted hover:text-ink", focusRing)}
            >
              Clear
            </button>
          )}
          <div className="ml-auto shrink-0 pl-2">{saveButton()}</div>
        </div>
      </div>
      {failed.length > 0 && <p className="mt-1 px-1 text-footnote text-muted">{failed.map((s) => s.label).join(", ")} didn't answer this time.</p>}

      <div className="mt-3 lg:flex lg:items-start lg:gap-8">
        <div className="min-w-0 flex-1">
          {isPending ? (
            <TileGrid className="mt-2">
              {[220, 170, 200, 160, 240, 180, 210, 190].map((h, i) => (
                <Skeleton key={i} className="mb-2 lg:mb-5" style={{ height: h }} />
              ))}
            </TileGrid>
          ) : isError ? (
            <EmptyState title="Search isn't working right now" body="Try again in a moment." />
          ) : results.length === 0 ? (
            <EmptyState
              title="Nothing found"
              body={filtered ? "Nothing matches these filters. Clear them to see everything." : "Try fewer words, or paste a product link."}
            />
          ) : (
            <TileGrid className="mt-2">
              {results.map((card) => (
                <Tile
                  key={card.productId}
                  card={card}
                  selected={card.productId === peek}
                  onOpen={(event) => {
                    event.preventDefault();
                    open(card.productId);
                  }}
                />
              ))}
            </TileGrid>
          )}
        </div>

        {peek && isWide && (
          <div className="sticky top-[136px] hidden h-[calc(100dvh-168px)] w-[420px] shrink-0 lg:block xl:w-[460px]">
            <ProductPeek
              key={peek}
              id={peek}
              onClose={close}
              onStep={step}
              position={peekIndex >= 0 ? `${peekIndex + 1} of ${results.length}` : ""}
            />
          </div>
        )}
        <ProductSheet
          open={Boolean(peek) && !isWide}
          id={peek ?? ""}
          onClose={close}
          onStep={step}
          position={peekIndex >= 0 ? `${peekIndex + 1} of ${results.length}` : ""}
        />
      </div>
    </section>
  );
}

type FilterOption = { value: string; label: string };

/**
 * One filter as a pill that opens its choices. Set, it fills with ink and names what's picked
 * ("Used", "Under $100"); unset, it names the filter. Sort is `neutral`: it always has a value.
 */
function FilterPill({
  label,
  value,
  options,
  onChange,
  neutral = false,
}: {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  neutral?: boolean;
}) {
  const picked = options.find((o) => o.value === value);
  const active = !neutral && Boolean(value);
  return (
    <Menu
      side="bottom"
      align="start"
      className="min-w-[200px]"
      trigger={
        <button
          type="button"
          aria-label={`${label}: ${picked?.label ?? "Any"}`}
          className={cn(
            "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full pr-3 pl-4 text-callout transition-colors",
            active ? "bg-ink font-medium text-on-ink" : "bg-surface font-normal text-ink hover:bg-line",
            focusRing,
          )}
        >
          {neutral ? (
            <>
              <span className="text-muted">{label}</span> {picked?.label}
            </>
          ) : active ? (
            picked?.label
          ) : (
            label
          )}
          <ChevronDownIcon size={16} className={active ? "" : "text-muted"} />
        </button>
      }
    >
      <MenuChoices value={value} onValueChange={onChange} options={options} />
    </Menu>
  );
}

/** "Good price" beats condition; at most one badge per photo. */
function badgeFor(card: ResultCard) {
  if (card.verdict.label === "good") return { text: "Good price", tone: "dark" as const };
  if (card.best.condition === "refurb") return { text: "Refurb", tone: "light" as const };
  if (card.best.condition === "used") return { text: "Used", tone: "light" as const };
  return null;
}

function Tile({ card, selected, onOpen }: { card: ResultCard; selected: boolean; onOpen?: (event: React.MouseEvent) => void }) {
  return (
    <ProductTile
      as={Link}
      to={`/p/${card.productId}`}
      onClick={onOpen}
      aria-current={selected ? "true" : undefined}
      className={cn(selected && "ring-2 ring-ink ring-offset-4 ring-offset-canvas")}
      image={card.imageUrl}
      alt={card.title}
      price={formatMoney(card.best.priceCents, card.best.currency) ?? ""}
      badge={badgeFor(card)}
      title={card.title}
      caption={card.storeCount > 1 ? `from ${card.storeCount} stores` : card.best.store.name}
    />
  );
}
