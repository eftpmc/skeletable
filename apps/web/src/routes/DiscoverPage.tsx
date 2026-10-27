import type { BrandCard as Brand } from "@closet/shared";
import { Button, EmptyState, ScreenTitle, SearchField, Skeleton, cn } from "@closet/ui";
import { useDeferredValue, useState } from "react";
import { BrandCard, BrandGrid } from "../components/BrandCard";
import { api } from "../lib/api";
import { useBrandSearch, useForYou, useStarters } from "../lib/catalog";

function Loading({ count = 8 }: { count?: number }) {
  return (
    <BrandGrid className="mt-5">
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <Skeleton className="aspect-[4/3] rounded-xl" />
          <Skeleton className="mt-3 h-4 w-2/3" />
        </div>
      ))}
    </BrandGrid>
  );
}

/** How far along your picks are, as dots: one per brand you've shown interest in, out of what's needed. */
function Progress({ interested, needed }: { interested: number; needed: number }) {
  return (
    <p className="mt-4 flex items-center gap-3 text-callout font-normal text-muted">
      <span aria-hidden="true" className="flex gap-1">
        {Array.from({ length: needed }, (_, i) => (
          <span key={i} className={cn("size-2 rounded-full", i < interested ? "bg-accent" : "bg-line")} />
        ))}
      </span>
      {interested === 0
        ? `Picks of your own start after ${needed} brands.`
        : `${interested} of ${needed} brands so far. Picks of your own start after ${needed}.`}
    </p>
  );
}

/**
 * Find brands people haven't heard of. Browse, and open the ones you like the look of: the time you
 * spend on a brand teaches Discover your taste. A heart says it outright, but it's optional.
 */
export function DiscoverPage() {
  const [q, setQ] = useState("");
  const typed = useDeferredValue(q);
  const found = useBrandSearch(typed);
  const forYou = useForYou();
  const starters = useStarters();
  const [more, setMore] = useState<Brand[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const searching = typed.trim().length > 0;
  const interested = forYou.data?.interested ?? 0;
  const needed = forYou.data?.needed ?? 5;
  const picks = forYou.data?.brands ?? [];

  // Another handful of starting points, without repeats.
  const browse = [...(starters.data ?? []), ...more].filter((b, i, all) => all.findIndex((x) => x.id === b.id) === i);
  async function loadMore() {
    setLoadingMore(true);
    try {
      const next = await api.starters();
      setMore((list) => [...list, ...next]);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <section className="pt-4 lg:pt-0">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <ScreenTitle className="lg:text-[40px] lg:leading-[44px]">Discover</ScreenTitle>
          <p className="mt-1 text-callout font-normal text-muted">
            Small brands found across the open web. Open the ones you like the look of; Discover learns from what you spend time on.
          </p>
        </div>
        <SearchField className="w-full lg:max-w-sm" value={q} onChange={setQ} onSubmit={setQ} placeholder="Find a brand by name" />
      </div>
      {!searching && forYou.data && !picks.length && <Progress interested={interested} needed={needed} />}

      {searching ? (
        <section aria-label="Brands found" className="mt-8">
          {found.isPending ? (
            <Loading count={4} />
          ) : found.data?.length ? (
            <BrandGrid>
              {found.data.map((b) => (
                <BrandCard key={b.id} brand={b} context="search" />
              ))}
            </BrandGrid>
          ) : (
            <EmptyState title={`We don't know “${typed.trim()}” yet`} body="The catalog grows as it reads more of the web. Try another brand, or browse below." />
          )}
        </section>
      ) : (
        <>
          {picks.length > 0 && (
            <section aria-labelledby="for-you" className="mt-10">
              <h2 id="for-you" className="text-title-2 text-ink">
                For you
              </h2>
              <BrandGrid className="mt-5">
                {picks.map((b) => (
                  <BrandCard key={b.id} brand={b} context="for-you" />
                ))}
              </BrandGrid>
            </section>
          )}

          <section aria-labelledby="browse" className={picks.length ? "mt-14" : "mt-8"}>
            {picks.length > 0 && (
              <h2 id="browse" className="text-title-2 text-ink">
                More to explore
              </h2>
            )}
            {starters.isPending ? (
              <Loading />
            ) : browse.length ? (
              <>
                <BrandGrid className={picks.length ? "mt-5" : undefined}>
                  {browse.map((b) => (
                    <BrandCard key={b.id} brand={b} context="starters" />
                  ))}
                </BrandGrid>
                <div className="mt-10 flex justify-center">
                  <Button variant="secondary" disabled={loadingMore} onClick={() => void loadMore()}>
                    {loadingMore ? "Finding more…" : "Show more brands"}
                  </Button>
                </div>
              </>
            ) : (
              <EmptyState title="The catalog is empty" body="Brands appear here once the catalog has been imported." />
            )}
          </section>
        </>
      )}
    </section>
  );
}
