import type { CatalogItem } from "@closet/shared";
import {
  ArrowUpRightIcon,
  BookmarkIcon,
  Button,
  ChevronLeftIcon,
  ChevronRightIcon,
  DragSheet,
  IconButton,
  Skeleton,
  XIcon,
  buttonClass,
  cn,
  focusRing,
} from "@closet/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { alertKeys } from "../lib/alerts";
import { ApiError, api } from "../lib/api";
import { useDwell } from "../lib/catalog";
import { brandMeta } from "./BrandCard";

type PeekProps = {
  id: string;
  onClose: () => void;
  onStep: (step: 1 | -1) => void;
  /** Open another item in the same place (from "More from" and "More like this"). */
  onOpen: (id: string) => void;
};

export const usd = (price: number | null) => (price === null ? null : `$${Math.round(price).toLocaleString()}`);

function PeekBar({ onClose, onStep }: Pick<PeekProps, "onClose" | "onStep">) {
  return (
    <div className="flex h-14 shrink-0 items-center gap-1 border-b border-line px-2">
      <IconButton label="Previous item" onClick={() => onStep(-1)}>
        <ChevronLeftIcon size={20} />
      </IconButton>
      <IconButton label="Next item" onClick={() => onStep(1)}>
        <ChevronRightIcon size={20} />
      </IconButton>
      <IconButton label="Close" onClick={onClose} className="ml-auto">
        <XIcon size={20} />
      </IconButton>
    </div>
  );
}

/** An item beside the feed (wide screens): the photo, the price, where to buy it, and more like it. */
export function ItemPeek(props: PeekProps) {
  return (
    <aside aria-label="Item" className="flex h-full flex-col overflow-hidden rounded-xl border border-line bg-canvas">
      <PeekBar onClose={props.onClose} onStep={props.onStep} />
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-8">
        <ItemBody id={props.id} onOpen={props.onOpen} />
      </div>
    </aside>
  );
}

/** The same on phones: a sheet over the feed that you pull down to close. */
export function ItemSheet({ open, ...props }: PeekProps & { open: boolean }) {
  return (
    <DragSheet open={open} onOpenChange={(next) => !next && props.onClose()} label="Item" header={<PeekBar onClose={props.onClose} onStep={props.onStep} />}>
      <div className="px-4 pt-4 pb-8">{open && <ItemBody key={props.id} id={props.id} onOpen={props.onOpen} />}</div>
    </DragSheet>
  );
}

function ItemBody({ id, onOpen }: { id: string; onOpen: (id: string) => void }) {
  const queryClient = useQueryClient();
  const { data, isPending, isError } = useQuery({ queryKey: ["catalog", "item", id], queryFn: () => api.catalogItem(id) });
  const [error, setError] = useState<string | null>(null);
  // How long this item stays open is Discover's quiet signal of taste.
  useDwell(`/api/catalog/items/${encodeURIComponent(id)}/seen`);

  const saved = data?.savedProductId ?? null;
  const toggle = useMutation({
    mutationFn: async () => {
      if (saved) await api.unwatch(saved);
      else await api.saveItem(id);
    },
    onMutate: () => setError(null),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["catalog", "item", id] });
      void queryClient.invalidateQueries({ queryKey: alertKeys.watches });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Couldn't save that. Try again."),
  });

  if (isPending) {
    return (
      <>
        <Skeleton className="aspect-[4/5] w-full rounded-xl" />
        <Skeleton className="mt-5 h-6 w-2/3" />
        <Skeleton className="mt-3 h-10 w-1/3" />
      </>
    );
  }
  if (isError || !data) return <p className="text-callout text-muted">We can't load this item right now.</p>;
  const { item, brand } = data;

  return (
    <>
      <img src={item.imageUrl} alt={item.title ?? ""} referrerPolicy="no-referrer" className="max-h-[62vh] w-full rounded-xl bg-tile object-contain" />
      <Link to={`/brands/${brand.id}`} className={cn("mt-5 inline-block rounded-sm text-callout font-semibold text-ink hover:underline", focusRing)}>
        {brand.name}
      </Link>
      <span className="ml-2 text-footnote text-muted">{brandMeta(brand)}</span>
      {item.title && <h2 className="mt-1 text-title-2 text-ink">{item.title}</h2>}
      {item.priceUsd !== null && <p className="mt-2 text-price-hero text-ink tabular-nums">{usd(item.priceUsd)}</p>}

      <div className="mt-5 flex gap-2">
        {item.productUrl && (
          <a href={item.productUrl} target="_blank" rel="noopener noreferrer" className={buttonClass({ className: "min-w-0 flex-1" })}>
            <span className="truncate">Buy at {brand.name}</span>
            <ArrowUpRightIcon size={16} className="shrink-0" />
          </a>
        )}
        <Button
          variant="secondary"
          aria-pressed={Boolean(saved)}
          disabled={toggle.isPending || !item.productUrl}
          icon={<BookmarkIcon size={16} fill={saved ? "currentColor" : "none"} />}
          onClick={() => toggle.mutate()}
        >
          {toggle.isPending ? (saved ? "Removing…" : "Saving…") : saved ? "Saved" : "Save"}
        </Button>
      </div>
      <p className="mt-2 text-footnote text-muted">
        {error ?? (saved ? "In Saved. You'll hear when the price drops." : "Save it to track the price.")}
      </p>

      <ItemStrip title={`More from ${brand.name}`} items={data.moreFromBrand} onOpen={onOpen} />
      <ItemStrip title="More like this" items={data.moreLikeThis} onOpen={onOpen} withBrand />
    </>
  );
}

function ItemStrip({ title, items, onOpen, withBrand = false }: { title: string; items: CatalogItem[]; onOpen: (id: string) => void; withBrand?: boolean }) {
  if (!items.length) return null;
  return (
    <section className="mt-8">
      <h3 className="text-section-label text-muted">{title}</h3>
      <ul className="mt-3 grid grid-cols-4 gap-2">
        {items.map((i) => (
          <li key={i.id}>
            <button type="button" onClick={() => onOpen(i.id)} className={cn("group block w-full rounded-lg text-left", focusRing)} title={i.title ?? undefined}>
              <img src={i.imageUrl} alt={i.title ?? ""} loading="lazy" referrerPolicy="no-referrer" className="aspect-square w-full rounded-lg bg-tile object-cover transition-opacity group-hover:opacity-90" />
              <span className="mt-1 block truncate text-footnote text-muted">{withBrand ? i.brandName : (usd(i.priceUsd) ?? "")}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
