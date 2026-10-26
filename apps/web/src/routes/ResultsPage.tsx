import { type Condition, conditionLabels, conditions } from "@closet/shared";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { SearchBar } from "../components/SearchBar";
import { Tile } from "../components/Tile";
import { api } from "../lib/api";

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

      <div className="-mx-4 mt-3 flex items-center gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:justify-center">
        {conditions.map((c) => (
          <Chip key={c} active={condition === c} onClick={() => set("condition", condition === c ? undefined : c)}>
            {conditionLabels[c]}
          </Chip>
        ))}
        <span aria-hidden="true" className="h-5 w-px shrink-0 bg-line" />
        {prices.map((p) => (
          <Chip key={p} active={max === p} onClick={() => set("max", max === p ? undefined : String(p))}>
            Under ${p}
          </Chip>
        ))}
      </div>

      {isPending ? (
        <Skeleton />
      ) : isError ? (
        <p className="mt-16 text-center text-muted">Search isn't working right now. Try again in a moment.</p>
      ) : data.results.length === 0 ? (
        <div className="mt-16 text-center">
          <p className="font-semibold">Nothing found</p>
          <p className="mt-1 text-sm text-muted">Try fewer words, or paste a product link.</p>
        </div>
      ) : (
        <>
          <div className="mt-5 flex items-baseline gap-2 px-1">
            <span className="text-[22px] font-bold tracking-tight">
              {data.results.length.toLocaleString()} {data.results.length === 1 ? "result" : "results"}
            </span>
            <span className="text-sm text-muted">
              {data.total.toLocaleString()} {data.total === 1 ? "offer" : "offers"} from {data.storeCount}{" "}
              {data.storeCount === 1 ? "store" : "stores"}
            </span>
          </div>
          {failed.length > 0 && (
            <p className="mt-1 px-1 text-xs text-muted">{failed.map((s) => s.label).join(", ")} didn't answer this time.</p>
          )}
          <div className="mt-3 columns-2 gap-2 sm:columns-3 lg:columns-4">
            {data.results.map((card) => (
              <Tile key={card.productId} card={card} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-9 shrink-0 rounded-full px-4 text-[15px] transition-colors ${
        active ? "bg-ink font-medium text-canvas" : "bg-surface text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function Skeleton() {
  return (
    <div className="mt-14 columns-2 gap-2 sm:columns-3 lg:columns-4">
      {[220, 170, 200, 160, 240, 180].map((h, i) => (
        <div key={i} className="mb-2 animate-pulse rounded-xl bg-surface" style={{ height: h }} />
      ))}
    </div>
  );
}
