import type { WatchSummary } from "@skeleton/shared";
import { EmptyState, ProductTile, ScreenTitle, Skeleton, TileGrid, buttonClass } from "@skeleton/ui";
import { Link } from "react-router";
import { useWatches } from "../lib/alerts";
import { formatMoney } from "../lib/format";

const DAY = 24 * 60 * 60 * 1000;

/** "Today", "Yesterday", "This week", "Earlier", by when tracking started. */
function groupOf(createdAt: string, now: Date) {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const at = new Date(createdAt).getTime();
  if (at >= startOfToday) return "Today";
  if (at >= startOfToday - DAY) return "Yesterday";
  if (at >= startOfToday - 6 * DAY) return "This week";
  return "Earlier";
}

export function SavedPage() {
  const { data: watches, isPending, isError } = useWatches();

  const groups = new Map<string, WatchSummary[]>();
  const now = new Date();
  for (const w of watches ?? []) {
    const name = groupOf(w.createdAt, now);
    groups.set(name, [...(groups.get(name) ?? []), w]);
  }
  const dropped = (watches ?? []).filter((w) => w.dropCents > 0).length;

  return (
    <section className="pt-4 lg:pt-0">
      <ScreenTitle className="lg:text-[40px] lg:leading-[44px]">Saved</ScreenTitle>
      {watches && watches.length > 0 && (
        <p className="mt-1 text-callout font-normal text-muted">
          Tracking {watches.length} {watches.length === 1 ? "price" : "prices"}
          {dropped > 0 && ` · ${dropped} dropped`}
        </p>
      )}

      {isPending ? (
        <TileGrid className="mt-8">
          {[200, 240, 180, 220].map((h, i) => (
            <Skeleton key={i} className="mb-2 lg:mb-5" style={{ height: h }} />
          ))}
        </TileGrid>
      ) : isError ? (
        <EmptyState className="mt-6" title="Saved isn't loading" body="Try again in a moment." />
      ) : watches.length === 0 ? (
        <EmptyState
          className="mt-6"
          title="Nothing saved yet"
          body="Tap Track price on any product and it shows up here with its best price. We'll tell you when it drops."
          action={
            <Link to="/" className={buttonClass()}>
              Search for something
            </Link>
          }
        />
      ) : (
        [...groups].map(([name, list]) => (
          <section key={name} aria-labelledby={`saved-${name}`} className="mt-8 lg:mt-10">
            <h2 id={`saved-${name}`} className="text-title-2 text-ink">
              {name}
            </h2>
            <TileGrid className="mt-3">
              {list.map((w) => (
                <ProductTile
                  key={w.productId}
                  as={Link}
                  to={`/p/${w.productId}`}
                  image={w.imageUrl}
                  alt={w.title}
                  price={formatMoney(w.currentPriceCents ?? w.savedPriceCents, w.currency) ?? "—"}
                  badge={w.dropCents > 0 ? { text: `−${formatMoney(w.dropCents, w.currency)}` } : null}
                  title={w.title}
                  caption={
                    w.currentPriceCents === null
                      ? "Not in stock anywhere right now"
                      : w.dropCents > 0
                        ? `Was ${formatMoney(w.savedPriceCents, w.currency)}`
                        : w.storeCount > 1
                          ? `${w.storeCount} stores`
                          : (w.brand ?? "1 store")
                  }
                />
              ))}
            </TileGrid>
          </section>
        ))
      )}
    </section>
  );
}
