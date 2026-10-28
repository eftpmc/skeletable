import type { AlertEvent } from "@skeleton/shared";
import { AlertCard, DropCard, EmptyState, ListGroup, ListRow, ScreenTitle, Skeleton, buttonClass } from "@skeleton/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Link } from "react-router";
import { alertKeys, searchDetail, searchHref, useSavedSearches, useWatches } from "../lib/alerts";
import { api } from "../lib/api";
import { formatMoney } from "../lib/format";

export function AlertsPage() {
  const queryClient = useQueryClient();
  const { data: feed, isPending } = useQuery({ queryKey: alertKeys.feed, queryFn: api.alerts });
  const { data: searches = [] } = useSavedSearches();
  const { data: watches = [] } = useWatches();

  // Opening Alerts reads them. The list keeps this visit's "New" split; the sidebar count clears.
  const marked = useRef(false);
  useEffect(() => {
    if (!feed || feed.unread === 0 || marked.current) return;
    marked.current = true;
    void api.readAlerts().then(() => queryClient.setQueryData(alertKeys.unread, { unread: 0 }));
  }, [feed, queryClient]);

  const fresh = feed?.events.filter((e) => !e.read) ?? [];
  const earlier = feed?.events.filter((e) => e.read) ?? [];
  const nothing = !isPending && feed?.events.length === 0 && searches.length === 0 && watches.length === 0;

  return (
    <section className="pt-4 lg:pt-0">
      <ScreenTitle className="lg:text-[40px] lg:leading-[44px]">Alerts</ScreenTitle>
      <p className="mt-1 text-callout font-normal text-muted">
        Get them on your phone or by email in{" "}
        <Link to="/settings/notifications" className="underline">
          Settings
        </Link>
        .
      </p>

      {nothing ? (
        <EmptyState
          className="mt-6"
          title="No alerts yet"
          body="Save a search and we'll tell you when new ones show up. Track a product and we'll tell you when its price drops."
          action={
            <Link to="/" className={buttonClass()}>
              Search for something
            </Link>
          }
        />
      ) : (
        <div className="mt-6 flex flex-col gap-10 lg:mt-8 lg:flex-row lg:items-start lg:gap-12">
          <div className="flex min-w-0 flex-1 flex-col gap-8">
            {isPending ? (
              <>
                <Skeleton className="h-24" />
                <Skeleton className="h-52" />
              </>
            ) : feed && feed.events.length === 0 ? (
              <p className="text-callout font-normal text-muted">
                Nothing new yet. We check your searches and tracked prices a few times a day.
              </p>
            ) : (
              <>
                {fresh.length > 0 && <Feed label={`New · ${fresh.length}`} events={fresh} />}
                {earlier.length > 0 && <Feed label="Earlier" events={earlier} />}
              </>
            )}
          </div>

          <aside aria-label="Your searches" className="flex w-full flex-col gap-6 lg:w-[360px] lg:shrink-0">
            {searches.length > 0 ? (
              <ListGroup label="Saved searches">
                {searches.map((s) => (
                  <ListRow key={s.id} as={Link} to={searchHref(s)} title={s.query} detail={searchDetail(s) || undefined} count={s.newCount} chevron />
                ))}
              </ListGroup>
            ) : (
              <p className="text-callout font-normal text-muted">Save a search from its results and it shows up here.</p>
            )}
            <ListGroup label="Watching prices">
              <ListRow
                as={Link}
                to="/saved"
                title={watches.length > 0 ? `${watches.length} saved ${watches.length === 1 ? "item" : "items"}` : "Nothing tracked yet"}
                chevron
              />
            </ListGroup>
          </aside>
        </div>
      )}
    </section>
  );
}

function Feed({ label, events }: { label: string; events: AlertEvent[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-section-label text-muted">{label}</h2>
      {events.map((e) =>
        e.kind === "price_drop" ? (
          <DropCard
            key={e.id}
            as={Link}
            to={`/p/${e.product.id}`}
            image={e.product.imageUrl ?? ""}
            title={e.product.title}
            price={formatMoney(e.toPriceCents, e.currency) ?? ""}
            was={formatMoney(e.fromPriceCents, e.currency) ?? ""}
          />
        ) : (
          <AlertCard
            key={e.id}
            as={Link}
            to={searchHref(e.search)}
            badge={`${e.count} NEW`}
            title={e.search.query}
            detail={searchDetail(e.search) || undefined}
            images={e.images.map((src) => ({ src }))}
          />
        ),
      )}
    </section>
  );
}
