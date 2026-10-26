import type { ElementType, ReactNode } from "react";
import { Badge, type BadgeTone, PricePill } from "./Badge";
import { cn, focusRing } from "./cn";

export type ProductTileProps = {
  image: string | null;
  alt: string;
  /** Formatted price, e.g. "$279". */
  price: string;
  /** At most one: "Good price" (dark) beats condition ("Used", "Refurb": light). */
  badge?: { text: string; tone?: BadgeTone } | null;
  /** Product name under the photo, in ink (wide grids). */
  title?: ReactNode;
  /** One muted line under the photo (or under the title): "3 stores · Sony WH-1000XM5". */
  caption?: ReactNode;
  /** Render as a router link: `as={Link} to="/p/1"`. Defaults to `<a href>`. */
  as?: ElementType;
  className?: string;
  [linkProp: string]: unknown;
};

/**
 * A product in the photo grid. The photo keeps its own shape (masonry); put tiles in a CSS
 * columns container (`columns-2 gap-2`). Nothing else sits on the photo.
 */
export function ProductTile({ image, alt, price, badge, title, caption, as: Component = "a", className, ...linkProps }: ProductTileProps) {
  return (
    <Component className={cn("group mb-2 block break-inside-avoid rounded-lg md:mb-5", focusRing, className)} {...linkProps}>
      <div className="relative overflow-hidden rounded-lg bg-tile">
        {image ? (
          <img src={image} alt={alt} loading="lazy" referrerPolicy="no-referrer" className="block w-full transition-transform duration-300 group-hover:scale-[1.02]" />
        ) : (
          <div className="flex aspect-square items-center justify-center p-4 text-center text-footnote text-muted">{alt}</div>
        )}
        <PricePill className="absolute top-2 right-2">{price}</PricePill>
        {badge && (
          <Badge tone={badge.tone ?? "dark"} className="absolute bottom-2 left-2">
            {badge.text}
          </Badge>
        )}
      </div>
      {title && <div className="mt-2 line-clamp-1 px-0.5 text-callout text-ink">{title}</div>}
      {caption && <div className={cn("line-clamp-1 px-0.5 text-footnote text-muted", title ? "mt-0.5" : "mt-1.5")}>{caption}</div>}
    </Component>
  );
}

/** The masonry grid for ProductTiles: 2 columns on phones, more as the screen widens (about 210px each). */
export function TileGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("columns-2 gap-2 sm:columns-3 md:columns-[210px] md:gap-4", className)}>{children}</div>;
}
