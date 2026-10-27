import { type Condition, conditionLabels } from "@closet/shared";
import {
  ArrowUpRightIcon,
  BookmarkIcon,
  Button,
  ChevronLeftIcon,
  ChevronRightIcon,
  IconButton,
  SegmentedControl,
  Skeleton,
  Verdict,
  XIcon,
  buttonClass,
  cn,
  focusRing,
} from "@closet/ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { useToggleWatch } from "../lib/alerts";
import { api } from "../lib/api";
import { formatMoney } from "../lib/format";
import { BuyMenu } from "../routes/ProductPage";

/**
 * A product beside the results (wide screens): the same price, verdict and stores as its page, in a
 * column, so you can step through results without losing your place in the grid.
 */
export function ProductPeek({
  id,
  onClose,
  onStep,
  position,
}: {
  id: string;
  onClose: () => void;
  onStep: (step: 1 | -1) => void;
  position: string;
}) {
  const { data: product, isPending, isError } = useQuery({ queryKey: ["product", id], queryFn: () => api.product(id) });
  const [picked, setPicked] = useState<{ id: string; condition: Condition } | null>(null);
  const tracking = useToggleWatch(id);

  const conditionsWithBest = product?.conditions.filter((c) => c.best) ?? [];
  const current =
    product?.conditions.find((c) => picked?.id === id && c.condition === picked.condition && c.best) ??
    product?.conditions.find((c) => c.condition === "new" && c.best) ??
    conditionsWithBest[0];
  const best = current?.best ?? null;

  return (
    <aside aria-label="Product" className="flex h-full flex-col overflow-hidden rounded-xl border border-line bg-canvas">
      <div className="flex h-14 shrink-0 items-center gap-1 border-b border-line px-2">
        <IconButton label="Previous result" onClick={() => onStep(-1)}>
          <ChevronLeftIcon size={20} />
        </IconButton>
        <IconButton label="Next result" onClick={() => onStep(1)}>
          <ChevronRightIcon size={20} />
        </IconButton>
        <span className="ml-1 text-footnote text-muted tabular-nums">{position}</span>
        <Link to={`/p/${id}`} className={cn("ml-auto rounded-full px-3 py-2 text-callout font-medium text-ink hover:bg-surface", focusRing)}>
          Full page
        </Link>
        <IconButton label="Close" onClick={onClose}>
          <XIcon size={20} />
        </IconButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-8">
        {isPending ? (
          <>
            <Skeleton className="aspect-[4/3] w-full rounded-xl" />
            <Skeleton className="mt-5 h-6 w-2/3" />
            <Skeleton className="mt-3 h-10 w-1/3" />
          </>
        ) : isError || !product ? (
          <p className="text-callout text-muted">We can't load this product right now.</p>
        ) : (
          <>
            {product.imageUrl ? (
              <img src={product.imageUrl} alt={product.title} referrerPolicy="no-referrer" className="aspect-[4/3] w-full rounded-xl bg-tile object-contain" />
            ) : (
              <div className="aspect-[4/3] rounded-xl bg-tile" />
            )}
            {product.brand && <div className="mt-5 text-callout font-normal text-muted">{product.brand}</div>}
            <h2 className="mt-0.5 text-title-2 text-ink">{product.title}</h2>

            {conditionsWithBest.length > 1 && current && (
              <SegmentedControl
                className="mt-4"
                label="Condition"
                value={current.condition}
                onValueChange={(value) => setPicked({ id, condition: value as Condition })}
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
                <div className="mt-5 flex gap-2">
                  <a href={best.url} target="_blank" rel="noopener noreferrer" className={buttonClass({ className: "flex-1 whitespace-nowrap" })}>
                    Buy at {best.store.name}
                    <ArrowUpRightIcon size={16} />
                  </a>
                  <Button
                    variant="secondary"
                    aria-pressed={tracking.watching}
                    disabled={tracking.pending}
                    icon={<BookmarkIcon size={16} fill={tracking.watching ? "currentColor" : "none"} />}
                    onClick={() => tracking.toggle()}
                  >
                    {tracking.watching ? "Tracking" : "Track"}
                  </Button>
                </div>
              </>
            )}

            {current && product.offers.length > 0 && (
              <div className="mt-8">
                <BuyMenu offers={product.offers} condition={current.condition} />
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
