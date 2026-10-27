import { type Condition, type ResultCard, type SearchIntent, budgetLabel, conditionLabels, conditions, intentFromParam, keywordIntent } from "@closet/shared";
import { BellIcon, CheckIcon, ChevronDownIcon, EmptyState, Menu, MenuChoices, ProductTile, Skeleton, TileGrid, cn, focusRing } from "@closet/ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import { ItemPeek, ItemSheet, usd } from "../components/ItemPeek";
import { ProductPeek, ProductSheet } from "../components/ProductPeek";
import { useWide } from "../lib/media";
import { useSavedSearch } from "../lib/alerts";
import { api } from "../lib/api";
import { formatMoney } from "../lib/format";
import { useSignedIn } from "../lib/viewer";

const prices = [50, 100, 250, 500];
/** Catalog products shown above the stores' results; the stores' answer is the fuller one. */
const CATALOG_SHOWN = 8;
const sorts = { best: "Best match", price: "Lowest price" } as const;
type Sort = keyof typeof sorts;


export function ResultsPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const explicitCondition = (params.get("condition") as Condition | null) ?? undefined;
  const explicitMax = params.get("max") ? Number(params.get("max")) : undefined;
  // A frozen interpretation (edited, or from a saved search) replays without another model call.
  const serializedIntent = params.get("intent");
  const frozen = intentFromParam(serializedIntent);
  const mode = params.get("mode") === "keyword" ? "keyword" : params.get("mode") === "assisted" ? "assisted" : "auto";
  const sort: Sort = params.get("sort") === "price" ? "price" : "best";
  // Wide screens open products beside the results; phones in a sheet over them.
  const isWide = useWide();
  const peek = params.get("p");
  const item = params.get("item");
  const location = useLocation();
  const navigate = useNavigate();
  // Opening a product adds a history entry, so Back (or the phone's back swipe) closes it.
  const openedHere = (location.state as { peek?: boolean } | null)?.peek === true;

  const { data, isPending, isError } = useQuery({
    queryKey: ["search", q, explicitCondition, explicitMax, serializedIntent, mode],
    queryFn: () => api.search({ q, condition: explicitCondition, max: explicitMax, intent: frozen, mode }),
    enabled: q.length > 0,
    staleTime: 5 * 60 * 1000,
  });
  // The catalog answers from memory, so its products show while the stores are still being asked.
  const catalog = useQuery({
    queryKey: ["catalog", "search", q],
    queryFn: () => api.catalogSearch(q),
    enabled: useSignedIn() && q.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  // The filters shown are the interpretation's: a single required condition, a USD "up to" budget.
  const intent = data?.intent ?? frozen ?? keywordIntent(q);
  const condition =
    intent.condition?.strength === "required" && intent.condition.values.length === 1 ? intent.condition.values[0] : undefined;
  const max =
    intent.budget?.strength === "required" && intent.budget.currency === "USD" && intent.budget.comparison === "lte"
      ? intent.budget.amountCents / 100
      : undefined;
  const priceOptions = [...new Set([...prices, ...(max ? [max] : [])])].sort((a, b) => a - b);

  const saved = useSavedSearch(q, undefined, undefined, data?.intent);
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
      disabled={saved.pending || !q || !data}
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

  // Changing a filter edits the interpretation, which then travels in the URL.
  const editIntent = (nextIntent: SearchIntent) => {
    const next = new URLSearchParams(params);
    next.set("q", nextIntent.text);
    next.set("intent", JSON.stringify({ ...nextIntent, mode: "edited" }));
    next.delete("condition");
    next.delete("max");
    setParams(next, { replace: true, state: location.state });
  };
  const set = (key: string, value: string | undefined, push = false) => {
    if (key === "condition")
      return editIntent({
        ...intent,
        condition: value ? { values: [value as Condition], strength: "required", evidence: "Selected condition" } : null,
      });
    if (key === "max")
      return editIntent({
        ...intent,
        budget: value
          ? { amountCents: Math.round(Number(value) * 100), currency: "USD", comparison: "lte", strength: "required", evidence: "Selected budget" }
          : null,
      });
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, push ? { state: { peek: true } } : { replace: true, state: location.state });
  };
  // One thing open at a time: a store product (p) or a catalog item (item).
  const show = (key: "p" | "item", id: string) => {
    const next = new URLSearchParams(params);
    next.delete(key === "p" ? "item" : "p");
    next.set(key, id);
    setParams(next, peek || item ? { replace: true, state: location.state } : { state: { peek: true } });
  };
  const open = (id: string) => show("p", id);
  const close = () => {
    if (openedHere) return navigate(-1);
    const next = new URLSearchParams(params);
    next.delete("p");
    next.delete("item");
    setParams(next, { replace: true, state: location.state });
  };

  // The catalog sells new at list price in US dollars, so it only fits a "new" condition and a dollar budget.
  const catalogFits = !intent.condition || intent.condition.strength !== "required" || intent.condition.values.includes("new");
  const catalogItems = catalogFits
    ? (catalog.data ?? []).filter((i) => !max || (i.priceUsd !== null && i.priceUsd <= max)).slice(0, CATALOG_SHOWN)
    : [];
  const itemIndex = item ? catalogItems.findIndex((i) => i.id === item) : -1;
  const stepItem = (by: 1 | -1) => {
    if (catalogItems.length === 0) return;
    show("item", catalogItems[(Math.max(itemIndex, 0) + by + catalogItems.length) % catalogItems.length]!.id);
  };

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
    if (tile && document.activeElement !== tile && tile.closest("[data-tile-grid]")?.contains(document.activeElement)) {
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

  const noSources = data?.sources.length === 0;
  const allFailed = !!data?.sources.length && failed.length === data.sources.length;
  const filtered = Boolean(intent.condition || intent.budget);

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
            options={[{ value: "", label: "Any price" }, ...priceOptions.map((p) => ({ value: String(p), label: `Up to $${p}` }))]}
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
              onClick={() => editIntent({ ...intent, condition: null, budget: null })}
              className={cn("h-9 shrink-0 rounded-full px-2 text-callout font-normal text-muted hover:text-ink", focusRing)}
            >
              Clear
            </button>
          )}
          <div className="ml-auto shrink-0 pl-2">{saveButton()}</div>
        </div>
      </div>
      {data && <Interpretation intent={intent} q={q} set={set} editIntent={editIntent} />}
      {failed.length > 0 && <p className="mt-1 px-1 text-footnote text-muted">{failed.map((s) => s.label).join(", ")} didn't answer this time.</p>}

      <div className="mt-3 lg:flex lg:items-start lg:gap-8">
        <div className="min-w-0 flex-1">
          {catalogItems.length > 0 && (
            <section aria-labelledby="catalog-results" className="mb-6">
              <h2 id="catalog-results" className="mt-2 mb-3 px-1 text-title-3 text-ink">
                From the catalog
              </h2>
              <TileGrid>
                {catalogItems.map((i) => (
                  <ProductTile
                    key={i.id}
                    as={Link}
                    to={`/discover?${new URLSearchParams({ item: i.id })}`}
                    onClick={(event: React.MouseEvent) => {
                      event.preventDefault();
                      show("item", i.id);
                    }}
                    aria-current={i.id === item ? "true" : undefined}
                    className={cn(i.id === item && "ring-2 ring-ink ring-offset-4 ring-offset-canvas")}
                    image={i.imageUrl}
                    alt={i.title ?? i.brandName}
                    price={usd(i.priceUsd) ?? ""}
                    title={i.title ?? undefined}
                    caption={i.brandName}
                  />
                ))}
              </TileGrid>
              <h2 className="mt-4 px-1 text-title-3 text-ink">From stores</h2>
            </section>
          )}
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
              title={noSources ? "No stores connected" : allFailed ? "Stores couldn't be reached" : "Nothing found"}
              body={
                noSources
                  ? "Store search hasn't been configured on this server. You can still paste a product link."
                  : allFailed
                    ? "The stores didn't answer this search. Try again in a moment."
                    : failed.length
                      ? "Some stores didn't answer, so these results are incomplete. Try again or change your search."
                      : filtered
                        ? "Nothing matches these filters. Clear them to see everything."
                        : "Try fewer words, or paste a product link."
              }
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
        {item && isWide && (
          <div className="sticky top-[136px] hidden h-[calc(100dvh-168px)] w-[420px] shrink-0 lg:block xl:w-[460px]">
            <ItemPeek key={item} id={item} onClose={close} onStep={stepItem} onOpen={(id) => show("item", id)} />
          </div>
        )}
        <ItemSheet open={Boolean(item) && !isWide} id={item ?? ""} onClose={close} onStep={stepItem} onOpen={(id) => show("item", id)} />
      </div>
    </section>
  );
}

type FilterOption = { value: string; label: string };

/** What the search was understood as: each applied condition, budget and attribute, removable, plus a custom budget. */
function Interpretation({
  intent,
  q,
  set,
  editIntent,
}: {
  intent: SearchIntent;
  q: string;
  set: (key: string, value: string | undefined) => void;
  editIntent: (intent: SearchIntent) => void;
}) {
  const chip = cn("inline-flex h-8 shrink-0 items-center rounded-full bg-surface px-3 text-footnote text-ink hover:bg-line", focusRing);
  return (
    <div className="mt-2 flex flex-col gap-2 px-1 text-footnote text-muted" aria-label="Applied search filters">
      <div className="flex flex-wrap items-center gap-2">
        <span>Searching for “{intent.text}”</span>
        {intent.condition && (
          <button type="button" className={chip} onClick={() => set("condition", undefined)}>
            {intent.condition.strength === "preferred" ? "Prefer: " : "Required: "}
            {intent.condition.values.map((c) => conditionLabels[c]).join(" or ")} · Remove
          </button>
        )}
        {intent.budget && (
          <button type="button" className={chip} onClick={() => set("max", undefined)}>
            {intent.budget.strength === "preferred" ? "Prefer: " : "Required: "}
            {budgetLabel(intent.budget)} · Remove
          </button>
        )}
        {intent.attributes.map((attribute, index) => (
          <button
            key={index}
            type="button"
            className={chip}
            onClick={() => editIntent({ ...intent, attributes: intent.attributes.filter((_, i) => i !== index) })}
          >
            {attribute.strength === "required" ? "Requested" : "Prefer"}: {attribute.text} · Unverified · Remove
          </button>
        ))}
        {intent.mode === "model" && (
          <button type="button" className={cn("underline", focusRing)} onClick={() => editIntent(keywordIntent(q))}>
            Use my original words
          </button>
        )}
      </div>
      {intent.attributes.length > 0 && <p>Style, size, material and other details help find candidates, but must be checked on the listing.</p>}
      {intent.uncertainties.map((uncertainty, index) => (
        <p key={index}>{uncertainty}</p>
      ))}
      <BudgetFilter key={JSON.stringify(intent.budget)} budget={intent.budget} onApply={(budget) => editIntent({ ...intent, budget })} />
    </div>
  );
}

function BudgetFilter({ budget, onApply }: { budget: SearchIntent["budget"]; onApply: (value: SearchIntent["budget"]) => void }) {
  const [value, setValue] = useState(budget ? String(budget.amountCents / 100) : "");
  const [currency, setCurrency] = useState<NonNullable<SearchIntent["budget"]>["currency"]>(budget?.currency ?? "USD");
  const [comparison, setComparison] = useState<NonNullable<SearchIntent["budget"]>["comparison"]>(budget?.comparison ?? "lte");
  const [strength, setStrength] = useState<"required" | "preferred">(budget?.strength ?? "required");
  const field = cn("rounded-lg border border-line bg-transparent p-1 text-ink", focusRing);
  return (
    <details>
      <summary className={cn("w-fit cursor-pointer", focusRing)}>Custom budget</summary>
      <form
        className="mt-2 flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onApply(
            value
              ? {
                  amountCents: Math.round(Number(value) * 100),
                  currency,
                  comparison,
                  strength: comparison === "around" ? "preferred" : strength,
                  evidence: "Selected budget",
                }
              : null,
          );
        }}
      >
        <input
          aria-label="Budget amount"
          type="number"
          min="0.01"
          max="1000000"
          step="0.01"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Any"
          className={cn(field, "w-24 px-2")}
        />
        <select aria-label="Budget currency" value={currency} onChange={(e) => setCurrency(e.target.value as typeof currency)} className={field}>
          {["USD", "EUR", "GBP", "CAD", "AUD"].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select
          aria-label="Budget comparison"
          value={comparison}
          onChange={(e) => setComparison(e.target.value as typeof comparison)}
          className={field}
        >
          <option value="lt">Under</option>
          <option value="lte">Up to</option>
          <option value="around">Around</option>
        </select>
        <select
          aria-label="Budget priority"
          value={comparison === "around" ? "preferred" : strength}
          disabled={comparison === "around"}
          onChange={(e) => setStrength(e.target.value as typeof strength)}
          className={field}
        >
          <option value="required">Required</option>
          <option value="preferred">Preferred</option>
        </select>
        <button type="submit" className={cn("rounded-lg bg-surface px-3 py-1 text-ink", focusRing)}>
          Apply
        </button>
      </form>
    </details>
  );
}

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
