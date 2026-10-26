import { type Condition, type ResultCard, conditionLabels, conditions } from "@closet/shared";
import { Chip, ChipDivider, ChipRow, EmptyState, ProductTile, Skeleton, TileGrid } from "@closet/ui";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { SearchBar } from "../components/SearchBar";
import { api } from "../lib/api";
import { formatMoney } from "../lib/format";

const prices = [50, 100, 250, 500];

export function ResultsPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const condition = (params.get("condition") as Condition | null) ?? undefined;
  const max = params.get("max") ? Number(params.get("max")) : undefined;

  const { data, isPending, isError } = useQuery({
    queryKey: ["search", q, condition, max],
    queryFn: () => api.search({ q, condition, max }),
    enabled: q.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const set = (key: string, value: string | undefined) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const failed = data?.sources.filter((s) => s.status !== "ok") ?? [];

  return (
    <section>
      <div className="mx-auto max-w-2xl">
        <SearchBar key={q} initial={q} back />
      </div>

      <ChipRow className="mt-3 md:justify-center">
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

      {isPending ? (
        <TileGrid className="mt-14">
          {[220, 170, 200, 160, 240, 180].map((h, i) => (
            <Skeleton key={i} className="mb-2" style={{ height: h }} />
          ))}
        </TileGrid>
      ) : isError ? (
        <EmptyState className="mt-10" title="Search isn't working right now" body="Try again in a moment." />
      ) : data.results.length === 0 ? (
        <EmptyState className="mt-10" title="Nothing found" body="Try fewer words, or paste a product link." />
      ) : (
        <>
          <div className="mt-5 flex items-baseline gap-2 px-1">
            <span className="text-title-2 text-ink">
              {data.results.length.toLocaleString()} {data.results.length === 1 ? "result" : "results"}
            </span>
            <span className="text-footnote text-muted">
              {data.total.toLocaleString()} {data.total === 1 ? "offer" : "offers"} from {data.storeCount}{" "}
              {data.storeCount === 1 ? "store" : "stores"}
            </span>
          </div>
          {failed.length > 0 && (
            <p className="mt-1 px-1 text-footnote text-muted">{failed.map((s) => s.label).join(", ")} didn't answer this time.</p>
          )}
          <TileGrid className="mt-3">
            {data.results.map((card) => (
              <Tile key={card.productId} card={card} />
            ))}
          </TileGrid>
        </>
      )}
    </section>
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
      caption={`${card.storeCount > 1 ? `${card.storeCount} stores` : card.best.store.name} · ${card.title}`}
    />
  );
}
