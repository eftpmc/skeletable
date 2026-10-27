import { type Condition, type ResultCard, conditionLabels, conditions } from "@closet/shared";
import { BellIcon, CheckIcon, Chip, ChipDivider, ChipRow, EmptyState, ProductTile, Skeleton, TileGrid, cn, focusRing } from "@closet/ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Link, useSearchParams } from "react-router";
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

  const set = (key: string, value: string | undefined) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const failed = data?.sources.filter((s) => s.status !== "ok") ?? [];
  const results = data ? (sort === "price" ? [...data.results].sort((a, b) => a.best.priceCents - b.best.priceCents) : data.results) : [];

  return (
    <section>
      {/* The search box is in the header. Phones: filters as chips. Wide screens get the sidebar instead. */}
      <ChipRow className="lg:hidden">
        {saveButton()}
        <ChipDivider />
        {conditions.map((c) => (
          <Chip key={c} selected={condition === c} onClick={() => set("condition", condition === c ? undefined : c)}>
            {conditionLabels[c]}
          </Chip>
        ))}
        <ChipDivider />
        {prices.map((p) => (
          <Chip key={p} selected={max === p} onClick={() => set("max", max === p ? undefined : String(p))}>
            Under ${p}
          </Chip>
        ))}
      </ChipRow>

      <div className="mt-5 lg:mt-0 lg:flex lg:items-start lg:gap-12">
        <aside aria-label="Filters" className="hidden w-52 shrink-0 flex-col gap-7 lg:flex">
          <FilterGroup
            legend="Condition"
            name="condition"
            value={condition ?? ""}
            onChange={(value) => set("condition", value || undefined)}
            options={[{ value: "", label: "Any condition" }, ...conditions.map((c) => ({ value: c, label: conditionLabels[c] }))]}
          />
          <FilterGroup
            legend="Price"
            name="max"
            value={max ? String(max) : ""}
            onChange={(value) => set("max", value || undefined)}
            options={[{ value: "", label: "Any price" }, ...prices.map((p) => ({ value: String(p), label: `Under $${p}` }))]}
          />
        </aside>

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
            <EmptyState title="Nothing found" body="Try fewer words, or paste a product link." />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1">
                <h1 className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-title-2 text-ink lg:text-[28px] lg:leading-8">
                    {results.length.toLocaleString()} {results.length === 1 ? "result" : "results"}
                  </span>
                  <span className="text-footnote text-muted lg:text-callout lg:font-normal">
                    {data.total.toLocaleString()} {data.total === 1 ? "offer" : "offers"} from {data.storeCount}{" "}
                    {data.storeCount === 1 ? "store" : "stores"}
                  </span>
                </h1>
                <div className="ml-auto hidden lg:block">{saveButton("h-10")}</div>
                <label className="hidden h-10 items-center gap-1.5 rounded-full border border-line pr-2 pl-4 text-callout font-normal text-muted lg:flex">
                  Sort
                  <select
                    value={sort}
                    onChange={(event) => set("sort", event.target.value === "best" ? undefined : event.target.value)}
                    className="bg-transparent text-callout text-ink outline-none"
                  >
                    {(Object.keys(sorts) as Sort[]).map((key) => (
                      <option key={key} value={key}>
                        {sorts[key]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {failed.length > 0 && (
                <p className="mt-1 px-1 text-footnote text-muted">{failed.map((s) => s.label).join(", ")} didn't answer this time.</p>
              )}
              <TileGrid className="mt-4">
                {results.map((card) => (
                  <Tile key={card.productId} card={card} />
                ))}
              </TileGrid>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

type FilterOption = { value: string; label: string };

/** One sidebar filter: a radio group, so exactly one option is always on ("Any" clears it). */
function FilterGroup({
  legend,
  name,
  value,
  options,
  onChange,
}: {
  legend: string;
  name: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-2 text-section-label text-muted uppercase">{legend}</legend>
      {options.map((option) => (
        <label
          key={option.value}
          className={cn(
            "flex h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-callout text-ink hover:bg-surface has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
            option.value === value ? "font-semibold" : "font-normal",
          )}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={option.value === value}
            onChange={() => onChange(option.value)}
            className="size-4 accent-ink outline-none"
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}

/** "Good price" beats condition; at most one badge per photo. */
function badgeFor(card: ResultCard) {
  if (card.verdict.label === "good") return { text: "Good price", tone: "dark" as const };
  if (card.best.condition === "refurb") return { text: "Refurb", tone: "light" as const };
  if (card.best.condition === "used") return { text: "Used", tone: "light" as const };
  return null;
}

function Tile({ card }: { card: ResultCard }) {
  return (
    <ProductTile
      as={Link}
      to={`/p/${card.productId}`}
      image={card.imageUrl}
      alt={card.title}
      price={formatMoney(card.best.priceCents, card.best.currency) ?? ""}
      badge={badgeFor(card)}
      title={card.title}
      caption={card.storeCount > 1 ? `from ${card.storeCount} stores` : card.best.store.name}
    />
  );
}
