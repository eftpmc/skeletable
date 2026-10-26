import type { ElementType, ReactNode } from "react";
import { Dot } from "./Badge";
import { cn, focusRing } from "./cn";
import { ChevronRightIcon } from "./icons";

export type ListGroupProps = { label?: string; children: ReactNode; className?: string };

/** iOS-style grouped list: an uppercase muted label above a rounded `surface` block of rows. */
export function ListGroup({ label, children, className }: ListGroupProps) {
  return (
    <section className={className}>
      {label && <h2 className="mb-2 px-4 text-section-label text-muted uppercase">{label}</h2>}
      <ul className="divide-y divide-line overflow-hidden rounded-xl bg-surface">{children}</ul>
    </section>
  );
}

export type ListRowProps = {
  title: ReactNode;
  /** Muted text after the title: a size, a filter ("< $250"). */
  detail?: ReactNode;
  /** Thumbnail or icon on the left. */
  leading?: ReactNode;
  /** Right side value: a price, "Connected". */
  value?: ReactNode;
  /** New-items count; shows the red dot beside it. */
  count?: number;
  chevron?: boolean;
  as?: ElementType;
  className?: string;
  [linkProp: string]: unknown;
};

/** One row in a ListGroup. Pass `as={Link}` and `to` (or `href`) to make it a link. */
export function ListRow({ title, detail, leading, value, count, chevron, as, className, ...props }: ListRowProps) {
  const Component = as ?? (props.href || props.onClick ? "a" : "div");
  return (
    <li>
      <Component className={cn("flex min-h-[52px] items-center gap-3 px-4 py-2.5 text-body text-ink", Component !== "div" && focusRing, className)} {...props}>
        {leading}
        <span className="min-w-0 flex-1 truncate">
          {title}
          {detail && <span className="ml-1.5 text-callout font-normal text-muted">{detail}</span>}
        </span>
        {value && <span className="shrink-0 tabular-nums">{value}</span>}
        {count ? (
          <span className="flex shrink-0 items-center gap-2 tabular-nums">
            {count}
            <Dot label={`${count} new`} />
          </span>
        ) : null}
        {chevron && <ChevronRightIcon size={18} className="shrink-0 text-muted" />}
      </Component>
    </li>
  );
}

/** Square thumbnail for list rows. */
export function Thumb({ src, alt = "" }: { src: string; alt?: string }) {
  return <img src={src} alt={alt} className="size-11 shrink-0 rounded-sm bg-tile object-cover" />;
}
