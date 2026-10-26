import { EmptyState, ScreenTitle, SearchField, SectionHeader, Skeleton } from "@closet/ui";
import { useDeferredValue, useState } from "react";
import { BrandCard, BrandGrid } from "../components/BrandCard";
import { useBrandSearch, useForYou, useStarters } from "../lib/catalog";

function Loading() {
  return (
    <BrandGrid className="mt-4">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-[260px] rounded-xl" />
      ))}
    </BrandGrid>
  );
}

/** Find brands people haven't heard of: start from any brand, or let your likes pick. */
export function DiscoverPage() {
  const [q, setQ] = useState("");
  const typed = useDeferredValue(q);
  const found = useBrandSearch(typed);
  const forYou = useForYou();
  const starters = useStarters();
  const searching = typed.trim().length > 0;
  const likes = forYou.data?.likes ?? 0;
  const needed = forYou.data?.needed ?? 5;
  const ready = (forYou.data?.brands.length ?? 0) > 0;

  return (
    <section className="pt-4 lg:pt-0">
      <ScreenTitle className="lg:text-[40px] lg:leading-[44px]">Discover</ScreenTitle>
      <p className="mt-1 max-w-2xl text-callout font-normal text-muted">
        Small clothing brands found across the open web. Start from a brand you know, and like the ones you'd wear: your picks
        learn from every like.
      </p>

      <SearchField
        className="mt-6 max-w-2xl"
        value={q}
        onChange={setQ}
        onSubmit={setQ}
        placeholder="Start from any brand, like Uniqlo"
      />

      {searching ? (
        <section aria-label="Brands found" className="mt-8">
          {found.isPending ? (
            <Loading />
          ) : found.data?.length ? (
            <BrandGrid>
              {found.data.map((b) => (
                <BrandCard key={b.id} brand={b} context="search" />
              ))}
            </BrandGrid>
          ) : (
            <EmptyState
              title={`We don't know “${typed.trim()}” yet`}
              body="The catalog grows as it reads more of the web. Try another brand you like, or pick one below."
            />
          )}
        </section>
      ) : (
        <>
          <section aria-labelledby="for-you" className="mt-10">
            <SectionHeader title={<span id="for-you">For you</span>} />
            {forYou.isPending ? (
              <Loading />
            ) : ready ? (
              <BrandGrid className="mt-4">
                {forYou.data!.brands.map((b, i) => (
                  <BrandCard key={b.id} brand={b} context="for-you" rank={i + 1} />
                ))}
              </BrandGrid>
            ) : (
              <div className="mt-4 rounded-xl bg-surface p-5">
                <p className="text-title-3 text-ink">
                  {likes === 0 ? `Like ${needed} brands to get picks of your own` : `${needed - likes} more ${needed - likes === 1 ? "like" : "likes"} to go`}
                </p>
                <p className="mt-1 max-w-xl text-callout font-normal text-muted">
                  Picks are ranked by how close each brand looks to the ones you liked. Mark misses “Not for me” too: it learns from both.
                </p>
                <div
                  className="mt-4 h-1.5 max-w-xs overflow-hidden rounded-full bg-line"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={needed}
                  aria-valuenow={likes}
                  aria-label="Likes so far"
                >
                  <div className="h-full rounded-full bg-accent" style={{ width: `${(100 * likes) / needed}%` }} />
                </div>
              </div>
            )}
          </section>

          <section aria-labelledby="start-from" className="mt-12">
            <SectionHeader title={<span id="start-from">{ready ? "More to explore" : "Start from one of these"}</span>} />
            {starters.isPending ? (
              <Loading />
            ) : starters.data?.length ? (
              <BrandGrid className="mt-4">
                {starters.data.map((b) => (
                  <BrandCard key={b.id} brand={b} context="starters" />
                ))}
              </BrandGrid>
            ) : (
              <EmptyState className="mt-4" title="The catalog is empty" body="Brands appear here once the catalog has been imported." />
            )}
          </section>
        </>
      )}
    </section>
  );
}
