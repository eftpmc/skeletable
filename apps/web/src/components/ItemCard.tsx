import type { Item } from "@closet/shared";
import { Link } from "react-router";

export function ItemCard({ item }: { item: Item }) {
  const cover = item.media[0];
  return (
    <Link to={`/closet/${item.id}`} className="group block">
      <div className="aspect-[4/5] overflow-hidden rounded-2xl bg-tile">
        {cover ? (
          <img
            src={cover.thumbUrl}
            alt=""
            loading="lazy"
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex size-full items-center justify-center px-4 text-center text-sm text-neutral-500">{item.title}</div>
        )}
      </div>
      <div className="mt-2 px-0.5">
        {item.brand && <div className="truncate text-[11px] font-medium tracking-wide text-muted uppercase">{item.brand}</div>}
        <div className="truncate text-sm">{item.title}</div>
      </div>
    </Link>
  );
}
