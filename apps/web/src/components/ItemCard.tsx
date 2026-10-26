import type { Item } from "@closet/shared";
import { cn, focusRing } from "@closet/ui";
import { Link } from "react-router";

export function ItemCard({ item }: { item: Item }) {
  const cover = item.media[0];
  return (
    <Link to={`/collection/${item.id}`} className={cn("group block rounded-lg", focusRing)}>
      <div className="aspect-[4/5] overflow-hidden rounded-lg bg-tile">
        {cover ? (
          <img
            src={cover.thumbUrl}
            alt=""
            loading="lazy"
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex size-full items-center justify-center px-4 text-center text-footnote text-muted">{item.title}</div>
        )}
      </div>
      <div className="mt-1.5 px-0.5">
        {item.brand && <div className="truncate text-footnote text-muted">{item.brand}</div>}
        <div className="truncate text-callout text-ink">{item.title}</div>
      </div>
    </Link>
  );
}
