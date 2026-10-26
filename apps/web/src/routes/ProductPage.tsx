import { type Condition, conditionLabels } from "@closet/shared";
import {
  ArrowUpRightIcon,
  BookmarkIcon,
  Button,
  buttonClass,
  ChevronLeftIcon,
  EmptyState,
  IconButton,
  ListGroup,
  ListRow,
  SegmentedControl,
  Skeleton,
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
  const [showAll, setShowAll] = useState(false);

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

        <ListGroup className="mt-5">
          <ListRow
            as="button"
            type="button"
            onClick={() => setShowAll((v) => !v)}
            aria-expanded={showAll}
            className="w-full text-left"
            title={`Compare all ${product.offers.length} ${product.offers.length === 1 ? "offer" : "offers"}`}
            value={<span className="text-callout font-normal text-muted">{showAll ? "Hide" : "Show"}</span>}
          />
          {showAll &&
            product.offers.map((o) => (
              <ListRow
                key={o.id}
                href={o.url}
                target="_blank"
                rel="noopener noreferrer"
                title={<span className="font-semibold">{o.store.name}</span>}
                detail={`${conditionLabels[o.condition]} · ${o.title}`}
                value={
                  <span className="flex items-center gap-2 text-price">
                    {formatMoney(o.priceCents, o.currency)}
                    <ArrowUpRightIcon size={16} className="text-muted" />
                  </span>
                }
              />
            ))}
        </ListGroup>

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

        {best && (
          <div className="fixed inset-x-0 bottom-14 z-10 flex gap-2 border-t border-line bg-canvas px-4 py-3 md:static md:mt-6 md:border-0 md:p-0">
            <IconButton label="Track price (coming soon)" tone="surface" size="lg" onClick={() => navigate("/saved")}>
              <BookmarkIcon size={20} />
            </IconButton>
            <a
              href={best.url}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass({ className: "flex-1" })}
            >
              Buy at {best.store.name}
            </a>
          </div>
        )}
      </div>
    </article>
  );
}
