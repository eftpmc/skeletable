import { type Condition, type OfferSummary, conditionLabels } from "@closet/shared";
import {
  ArrowUpRightIcon,
  BookmarkIcon,
  Button,
  ChevronLeftIcon,
  buttonClass,
  cn,
  focusRing,
  EmptyState,
  IconButton,
  ListGroup,
  ListRow,
  SegmentedControl,
  Sheet,
  Skeleton,
  StoreIcon,
  StoreStack,
  Verdict,
} from "@closet/ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useAddItem } from "../components/AddItem";
import { useToggleWatch } from "../lib/alerts";
import { api } from "../lib/api";
import { formatMoney } from "../lib/format";

export function ProductPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const addItem = useAddItem();
  const { data: product, isPending, isError } = useQuery({ queryKey: ["product", id], queryFn: () => api.product(id) });
  const [picked, setPicked] = useState<Condition | null>(null);
  const [buying, setBuying] = useState(false);
  const tracking = useToggleWatch(id);

  if (isPending) return <Skeleton className="mx-auto mt-4 aspect-square max-w-xl rounded-xl" />;
  if (isError || !product) {
    return (
      <EmptyState
        className="mx-auto mt-10 max-w-xl"
        title="We can't find that product"
        body="It may have sold out everywhere. Try searching for it by name."
        action={<Button onClick={() => navigate("/")}>Back to search</Button>}
      />
    );
  }

  const available = product.conditions.filter((c) => c.best);
  const current =
    product.conditions.find((c) => c.condition === picked && c.best) ??
    product.conditions.find((c) => c.condition === "new" && c.best) ??
    available[0];
  const best = current?.best ?? null;

  const back = () => (window.history.length > 1 ? navigate(-1) : navigate("/"));
  const sorted = current ? sortOffers(product.offers, current.condition) : product.offers;
  const stores = storesOf(product.offers);

  return (
    <article className="mx-auto max-w-6xl pb-24 lg:pb-0">
      <button
        type="button"
        onClick={back}
        className={cn("mb-3 hidden h-11 items-center gap-1.5 rounded-full pr-3 text-callout font-normal text-muted hover:text-ink lg:inline-flex", focusRing)}
      >
        <ChevronLeftIcon size={18} />
        Back
      </button>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-14">
        <div className="relative -mx-4 min-w-0 lg:mx-0">
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.title}
              referrerPolicy="no-referrer"
              className="aspect-square max-h-[70vh] w-full bg-tile object-contain lg:max-h-none lg:rounded-[20px]"
            />
          ) : (
            <div className="aspect-square bg-tile lg:rounded-[20px]" />
          )}
          <IconButton label="Back" tone="floating" onClick={back} className="absolute top-3 left-3 lg:hidden">
            <ChevronLeftIcon size={20} />
          </IconButton>
        </div>

        <div className="min-w-0 lg:max-w-[520px] lg:pt-2">
          {product.brand && <div className="text-callout font-normal text-muted lg:text-body">{product.brand}</div>}
          <h1 className="mt-0.5 text-title-2 text-ink lg:mt-1 lg:text-[32px] lg:leading-[1.1] lg:font-extrabold lg:tracking-[-0.03em] xl:text-[40px]">
            {product.title}
          </h1>

          {available.length > 1 && current && (
            <SegmentedControl
              className="mt-4 lg:mt-7"
              size="lg"
              label="Condition"
              value={current.condition}
              onValueChange={(value) => setPicked(value as Condition)}
              segments={product.conditions.map((c) => ({
                value: c.condition,
                label: conditionLabels[c.condition],
                detail: (c.best && formatMoney(c.best.priceCents, c.best.currency)) || undefined,
                disabled: !c.best,
              }))}
            />
          )}

          {best && current && (
            <>
              <div className="mt-5 flex items-baseline gap-2 lg:mt-7 lg:gap-3">
                <span className="text-price-hero text-ink tabular-nums lg:text-[56px] lg:leading-none lg:tracking-[-0.04em]">
                  {formatMoney(best.priceCents, best.currency)}
                </span>
                <span className="text-body text-muted lg:text-lg">at {best.store.name}</span>
              </div>
              <Verdict className="mt-1 lg:mt-3" label={current.verdict.label} text={current.verdict.text} />
            </>
          )}

          <p className="mt-3 text-footnote text-muted lg:hidden">
            {product.offers.length} {product.offers.length === 1 ? "offer" : "offers"} from {stores.length} {stores.length === 1 ? "store" : "stores"}
          </p>

          {best && current && (
            <>
              {/* Narrow screens: a bar along the bottom; Buy opens every store in a sheet. */}
              <div className="fixed inset-x-0 bottom-0 z-10 flex gap-2 border-t border-line bg-canvas px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] lg:hidden">
                <IconButton
                  label={tracking.watching ? "Stop tracking price" : "Track price"}
                  aria-pressed={tracking.watching}
                  tone="surface"
                  size="lg"
                  disabled={tracking.pending}
                  onClick={() => tracking.toggle()}
                >
                  <BookmarkIcon size={20} fill={tracking.watching ? "currentColor" : "none"} />
                </IconButton>
                <Button className="flex-1" aria-haspopup="dialog" onClick={() => setBuying(true)}>
                  <StoreStack stores={storesOf(sorted).map(storeIconProps)} size={22} />
                  Buy from {formatMoney(best.priceCents, best.currency)}
                </Button>
              </div>

              {/* Wide screens: buy the best offer directly; the table below compares the rest. */}
              <div className="mt-7 hidden gap-2.5 lg:flex">
                <a href={best.url} target="_blank" rel="noopener noreferrer" className={buttonClass({ className: "h-14 flex-1 whitespace-nowrap" })}>
                  Buy at {best.store.name}
                  <ArrowUpRightIcon size={18} />
                </a>
                <Button
                  variant="secondary"
                  className="h-14 whitespace-nowrap"
                  aria-pressed={tracking.watching}
                  disabled={tracking.pending}
                  icon={<BookmarkIcon size={18} fill={tracking.watching ? "currentColor" : "none"} />}
                  onClick={() => tracking.toggle()}
                >
                  {tracking.watching ? "Tracking price" : "Track price"}
                </Button>
              </div>
            </>
          )}

          <Button
            variant="quiet"
            className="mt-3 -ml-3"
            onClick={() =>
              addItem({
                title: product.title,
                brand: product.brand,
                priceCents: best?.priceCents ?? null,
                currency: best?.currency ?? null,
                sourceUrl: best?.url ?? null,
                imageUrl: product.imageUrl,
              })
            }
          >
            I already own this
          </Button>
        </div>
      </div>

      {current && sorted.length > 0 && (
        <section aria-labelledby="stores-heading" className="mt-16 hidden lg:block">
          <div className="flex items-baseline gap-3">
            <h2 id="stores-heading" className="text-[28px] leading-8 font-bold tracking-[-0.02em] text-ink">
              Every store
            </h2>
            <span className="text-callout font-normal text-muted">
              {product.offers.length} {product.offers.length === 1 ? "offer" : "offers"} · {conditionLabels[current.condition].toLowerCase()} first,
              cheapest first
            </span>
          </div>
          <OfferTable offers={sorted} />
        </section>
      )}

      {current && (
        <Sheet open={buying} onOpenChange={setBuying} title="Where to buy">
          <BuyMenu offers={product.offers} condition={current.condition} />
        </Sheet>
      )}
    </article>
  );
}

/** Every offer side by side, for wide screens. Each row opens the store. */
function OfferTable({ offers }: { offers: OfferSummary[] }) {
  const cheapest = Math.min(...offers.map((o) => o.priceCents));
  return (
    <table className="mt-4 w-full border-collapse text-left text-body">
      <thead>
        <tr className="text-section-label text-muted uppercase">
          <th scope="col" className="border-b border-line pr-3 pb-3 font-semibold">
            Store
          </th>
          <th scope="col" className="border-b border-line px-3 pb-3 font-semibold">
            Condition
          </th>
          <th scope="col" className="border-b border-line px-3 pb-3 text-right font-semibold">
            Price
          </th>
          <th scope="col" className="border-b border-line pb-3 pl-3">
            <span className="sr-only">Link</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {offers.map((o) => (
          <tr key={o.id} className="hover:bg-surface/60">
            <td className="border-b border-line py-3 pr-3">
              <span className="flex items-center gap-3">
                <StoreIcon {...storeIconProps(o.store)} size={36} />
                <span className="font-medium">{o.store.name}</span>
              </span>
            </td>
            <td className="border-b border-line px-3 py-3">{conditionLabels[o.condition]}</td>
            <td className="border-b border-line px-3 py-3 text-right font-bold tabular-nums">
              {o.priceCents === cheapest && offers.length > 1 && (
                <span className="mr-2 align-middle text-label font-semibold text-muted uppercase">Lowest</span>
              )}
              {formatMoney(o.priceCents, o.currency)}
            </td>
            <td className="border-b border-line py-3 pl-3 text-right">
              <a
                href={o.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Visit ${o.store.name}`}
                className={cn("inline-flex h-10 items-center gap-1.5 rounded-full bg-surface px-4 text-callout text-ink hover:bg-line", focusRing)}
              >
                Visit
                <ArrowUpRightIcon size={15} />
              </a>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export const storeIconProps = (store: OfferSummary["store"]) => ({ name: store.name, src: storeIconUrl(store.domain) });
const storeIconUrl = (domain: string) => `/api/store-icons/${encodeURIComponent(domain)}`;

/** Each store once, in the order given. */
export function storesOf(offers: OfferSummary[]) {
  return [...new Map(offers.map((o) => [o.store.domain, o.store])).values()];
}

/** The picked condition first, cheapest first within each condition. */
export function sortOffers(offers: OfferSummary[], condition: Condition) {
  return [...offers].sort((a, b) => Number(b.condition === condition) - Number(a.condition === condition) || a.priceCents - b.priceCents);
}

/** Every store selling this product: the picked condition first, then the others. Each row opens the store. */
export function BuyMenu({ offers, condition }: { offers: OfferSummary[]; condition: Condition }) {
  const sorted = sortOffers(offers, condition);
  const picked = sorted.filter((o) => o.condition === condition);
  const others = sorted.filter((o) => o.condition !== condition);
  const row = (o: OfferSummary, index: number, group: OfferSummary[]) => (
    <ListRow
      key={o.id}
      href={o.url}
      target="_blank"
      rel="noopener noreferrer"
      leading={<StoreIcon {...storeIconProps(o.store)} size={36} />}
      title={o.store.name}
      detail={group === others ? conditionLabels[o.condition] : group.length === 1 ? undefined : index === 0 ? "Lowest price" : `+${formatMoney(o.priceCents - group[0]!.priceCents, o.currency)}`}
      value={
        <span className="flex items-center gap-2 text-price">
          {formatMoney(o.priceCents, o.currency)}
          <ArrowUpRightIcon size={16} className="text-muted" />
        </span>
      }
    />
  );
  return (
    <div className="space-y-6">
      <ListGroup label={conditionLabels[condition]}>{picked.map((o, i) => row(o, i, picked))}</ListGroup>
      {others.length > 0 && <ListGroup label="Other conditions">{others.map((o, i) => row(o, i, others))}</ListGroup>}
    </div>
  );
}
