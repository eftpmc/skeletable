import { Children, type ElementType, type ReactNode, isValidElement, useCallback, useEffect, useLayoutEffect, useRef } from "react";
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
  /** The photo's size in pixels, when known: the tile holds that shape before the photo loads. */
  imageSize?: { width: number | null; height: number | null } | null;
  /** Render as a router link: `as={Link} to="/p/1"`. Defaults to `<a href>`. */
  as?: ElementType;
  className?: string;
  [linkProp: string]: unknown;
};

/**
 * A product in the photo grid. The photo keeps its own shape (masonry); put tiles in a TileGrid.
 * Nothing else sits on the photo.
 */
export function ProductTile({ image, alt, price, badge, title, caption, imageSize, as: Component = "a", className, ...linkProps }: ProductTileProps) {
  const shape = imageSize?.width && imageSize.height ? `${imageSize.width} / ${imageSize.height}` : undefined;
  return (
    <Component className={cn("group mb-2 block rounded-lg md:mb-5", focusRing, className)} {...linkProps}>
      <div className="relative overflow-hidden rounded-lg bg-tile">
        {image ? (
          <img
            src={image}
            alt={alt}
            loading="lazy"
            referrerPolicy="no-referrer"
            width={imageSize?.width ?? undefined}
            height={imageSize?.height ?? undefined}
            style={shape ? { aspectRatio: shape } : undefined}
            className="block h-auto w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
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

/**
 * The masonry grid for ProductTiles: 2 columns on phones, 3 on small tablets, then as many of about
 * 210px as fit. A tile goes to the shortest column the first time it shows and stays there, so loading
 * more only adds below and nothing on screen moves sideways. Tiles keep reading order in the page, for
 * keyboards and screen readers; only where they're drawn is arranged.
 */
export function TileGrid({ children, className }: { children: ReactNode; className?: string }) {
  const grid = useRef<HTMLDivElement>(null);
  const columnOf = useRef(new Map<string, number>());
  const columnCount = useRef(0);

  const layout = useCallback(() => {
    const node = grid.current;
    const width = node?.clientWidth ?? 0;
    if (!node || !width) return;
    const wide = window.matchMedia("(min-width: 768px)").matches;
    const gap = wide ? 16 : 8;
    const count = wide ? Math.max(1, Math.floor((width + gap) / (210 + gap))) : window.matchMedia("(min-width: 640px)").matches ? 3 : 2;
    const columnWidth = (width - gap * (count - 1)) / count;
    // A different number of columns starts the arrangement over.
    if (count !== columnCount.current) {
      columnOf.current.clear();
      columnCount.current = count;
    }
    const cells = Array.from(node.children) as HTMLElement[];
    // Widths first, so every height below is measured at its final width.
    for (const cell of cells) cell.style.width = `${columnWidth}px`;
    const heights = new Array<number>(count).fill(0);
    const planned = new Array<number>(count).fill(0);
    const present = new Set<string>();
    for (const cell of cells) {
      const key = cell.dataset.key!;
      present.add(key);
      let column = columnOf.current.get(key);
      if (column === undefined) {
        column = planned.indexOf(Math.min(...planned));
        columnOf.current.set(key, column);
      }
      const height = cell.offsetHeight;
      cell.style.transform = `translate(${column * (columnWidth + gap)}px, ${heights[column]}px)`;
      heights[column]! += height;
      // A photo still loading has no height yet: count it as a typical one when choosing columns.
      const image = cell.querySelector("img");
      planned[column]! += image && !image.complete ? Math.max(height, columnWidth * 1.25) : height;
    }
    for (const key of columnOf.current.keys()) if (!present.has(key)) columnOf.current.delete(key);
    node.style.height = `${Math.max(0, ...heights)}px`;
  }, []);

  // Before each paint, place whatever is new.
  useLayoutEffect(layout);

  // Again when the grid's width changes or a photo arrives (load events don't bubble, so listen while capturing).
  useEffect(() => {
    const node = grid.current;
    if (!node) return;
    let frame = 0;
    const later = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(layout);
    };
    const observer = new ResizeObserver(later);
    observer.observe(node);
    node.addEventListener("load", later, true);
    node.addEventListener("error", later, true);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      node.removeEventListener("load", later, true);
      node.removeEventListener("error", later, true);
    };
  }, [layout]);

  return (
    <div ref={grid} data-tile-grid="" className={cn("relative", className)}>
      {Children.toArray(children)
        .filter(isValidElement)
        .map((child) => (
          <div key={child.key} data-key={String(child.key)} className="absolute top-0 left-0 flow-root">
            {child}
          </div>
        ))}
    </div>
  );
}
