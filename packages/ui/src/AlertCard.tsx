import type { ElementType, ReactNode } from "react";
import { Badge } from "./Badge";
import { cn, focusRing } from "./cn";

type LinkProps = { as?: ElementType; className?: string; [linkProp: string]: unknown };

export type AlertCardProps = LinkProps & {
  /** "12 NEW" */
  badge: string;
  title: ReactNode;
  /** Muted after the title: "under $250", "size 10". */
  detail?: ReactNode;
  /** Up to 3 photos of the new matches. */
  images: { src: string; alt?: string }[];
};

/** New matches for a saved search. Lifted like the search field. */
export function AlertCard({ badge, title, detail, images, as: Component = "a", className, ...props }: AlertCardProps) {
  return (
    <Component className={cn("block rounded-xl bg-canvas p-3.5 shadow-field", focusRing, className)} {...props}>
      <Badge>{badge}</Badge>
      <div className="mt-2 text-title-3 text-ink">
        {title}
        {detail && <span className="ml-1.5 text-callout font-normal text-muted">{detail}</span>}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {images.slice(0, 3).map((image, i) => (
          <img key={i} src={image.src} alt={image.alt ?? ""} referrerPolicy="no-referrer" className="h-[104px] w-full rounded-md bg-tile object-cover" />
        ))}
      </div>
    </Component>
  );
}

export type DropCardProps = LinkProps & {
  image: string;
  title: ReactNode;
  /** Formatted current price and the one it dropped from. */
  price: string;
  was: string;
};

/** A price drop on something you track. */
export function DropCard({ image, title, price, was, as: Component = "a", className, ...props }: DropCardProps) {
  return (
    <Component className={cn("flex items-center gap-3 rounded-xl bg-canvas p-3 shadow-field", focusRing, className)} {...props}>
      <img src={image} alt="" referrerPolicy="no-referrer" className="size-14 shrink-0 rounded-md bg-tile object-cover" />
      <div className="min-w-0 flex-1">
        <div className="text-section-label text-muted">Price drop</div>
        <div className="truncate text-body font-semibold text-ink">{title}</div>
      </div>
      <div className="shrink-0 text-right tabular-nums">
        <div className="text-body font-extrabold text-ink">{price}</div>
        <div className="text-footnote text-muted line-through">{was}</div>
      </div>
    </Component>
  );
}
