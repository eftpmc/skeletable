import { type Condition, type OfferSummary, conditionLabels } from "@closet/shared";
import {
  ArrowUpRightIcon,
  BookmarkIcon,
  Button,
  ChevronLeftIcon,
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
import { api } from "../lib/api";
import { formatMoney } from "../lib/format";

export function ProductPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const addItem = useAddItem();
  const { data: product, isPending, isError } = useQuery({ queryKey: ["product", id], queryFn: () => api.product(id) });
  const [picked, setPicked] = useState<Condition | null>(null);
  const [buying, setBuying] = useState(false);

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

  return (
    <article className="mx-auto grid max-w-5xl gap-6 pb-24 md:grid-cols-2 md:gap-10 md:pb-0">
      <div className="relative -mx-4 min-w-0 md:mx-0">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.title}
            referrerPolicy="no-referrer"
            className="max-h-[70vh] w-full bg-tile object-contain md:rounded-xl"
          />
        ) : (
          <div className="aspect-square bg-tile md:rounded-xl" />
        )}
        <IconButton
          label="Back"
          tone="floating"
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/"))}
          className="absolute top-3 left-3"
        >
          <ChevronLeftIcon size={20} />
        </IconButton>
      </div>

      <div className="min-w-0 md:pt-4">
        {product.brand && <div className="text-callout font-normal text-muted">{product.brand}</div>}
        <h1 className="mt-0.5 text-title-2 text-ink">{product.title}</h1>

        {available.length > 1 && current && (
          <SegmentedControl
            className="mt-4"
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
            <div className="mt-5 flex items-baseline gap-2">
              <span className="text-price-hero text-ink tabular-nums">{formatMoney(best.priceCents, best.currency)}</span>
              <span className="text-body text-muted">at {best.store.name}</span>
            </div>
            <Verdict className="mt-1" label={current.verdict.label} text={current.verdict.text} />
          </>
        )}

        <p className="mt-3 text-footnote text-muted">
          {product.offers.length} {product.offers.length === 1 ? "offer" : "offers"} from {storesOf(product.offers).length}{" "}
          {storesOf(product.offers).length === 1 ? "store" : "stores"}
        </p>

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

        {best && current && (
          <div className="fixed inset-x-0 bottom-14 z-10 flex gap-2 border-t border-line bg-canvas px-4 py-3 md:static md:mt-6 md:border-0 md:p-0">
            <IconButton label="Track price (coming soon)" tone="surface" size="lg" onClick={() => navigate("/saved")}>
              <BookmarkIcon size={20} />
            </IconButton>
            <Button className="flex-1" aria-haspopup="dialog" onClick={() => setBuying(true)}>
              <StoreStack stores={storesOf(sortOffers(product.offers, current.condition)).map(storeIconProps)} size={22} />
              Buy from {formatMoney(best.priceCents, best.currency)}
            </Button>
          </div>
        )}
      </div>

      {current && (
        <Sheet open={buying} onOpenChange={setBuying} title="Where to buy">
          <BuyMenu offers={product.offers} condition={current.condition} />
        </Sheet>
      )}
    </article>
  );
}

const storeIconProps = (store: OfferSummary["store"]) => ({ name: store.name, src: storeIconUrl(store.domain) });
const storeIconUrl = (domain: string) => `/api/store-icons/${encodeURIComponent(domain)}`;

/** Each store once, in the order given. */
function storesOf(offers: OfferSummary[]) {
  return [...new Map(offers.map((o) => [o.store.domain, o.store])).values()];
}

/** The picked condition first, cheapest first within each condition. */
function sortOffers(offers: OfferSummary[], condition: Condition) {
  return [...offers].sort((a, b) => Number(b.condition === condition) - Number(a.condition === condition) || a.priceCents - b.priceCents);
}

/** Every store selling this product: the picked condition first, then the others. Each row opens the store. */
function BuyMenu({ offers, condition }: { offers: OfferSummary[]; condition: Condition }) {
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
