import type { ElementType, ReactNode } from "react";
import { cn, focusRing } from "./cn";

export type NavItem = {
  label: string;
  icon: (props: { size?: number; strokeWidth?: number }) => ReactNode;
  active?: boolean;
  /** New-items count (unread alerts), shown as a small number. */
  count?: number;
  [linkProp: string]: unknown;
};

/** A count in a black pill: the only status mark in navigation. No dots. */
function CountPill({ count, className }: { count: number; className?: string }) {
  return (
    <span className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1.5 text-label text-on-ink tabular-nums", className)}>
      {count > 99 ? "99+" : count}
      <span className="sr-only"> new</span>
    </span>
  );
}

/**
 * The phone tab bar: four icons, no labels (labels go to screen readers). The active icon is
 * drawn heavier, not colored. Pass `as={Link}` and give each item its `to`.
 */
export function TabBar({ items, as: Component = "a", className }: { items: NavItem[]; as?: ElementType; className?: string }) {
  return (
    <nav aria-label="Main" className={cn("border-t border-line bg-canvas/95 pb-[env(safe-area-inset-bottom)] backdrop-blur", className)}>
      <div className="mx-auto flex max-w-md justify-around">
        {items.map(({ label, icon: Icon, active, count, ...linkProps }) => (
          <Component
            key={label}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            className={cn("relative flex h-14 flex-1 items-center justify-center", active ? "text-ink" : "text-muted", focusRing)}
            {...linkProps}
          >
            <Icon size={26} strokeWidth={active ? 2.6 : 1.8} />
            {count ? <CountPill count={count} className="absolute top-2 left-1/2 ml-1.5" /> : null}
          </Component>
        ))}
      </div>
    </nav>
  );
}

/**
 * The desktop sidebar: wordmark, one row per section (icon and name), and a footer slot for the
 * account. The current section is filled with the theme color.
 */
export function SideNav({
  items,
  as: Component = "a",
  brand,
  footer,
  className,
}: {
  items: NavItem[];
  as?: ElementType;
  brand: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <aside className={cn("flex w-[232px] shrink-0 flex-col gap-6 border-r border-line px-4 py-5", className)}>
      {brand}
      <nav aria-label="Main" className="flex flex-col gap-0.5">
        {items.map(({ label, icon: Icon, active, count, ...linkProps }) => (
          <Component
            key={label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-11 items-center gap-3 rounded-lg px-3 text-callout transition-colors",
              active ? "bg-accent font-semibold text-on-accent" : "font-medium text-ink hover:bg-surface",
              focusRing,
            )}
            {...linkProps}
          >
            <Icon size={20} strokeWidth={1.9} />
            {label}
            {count ? <CountPill count={count} className="ml-auto" /> : null}
          </Component>
        ))}
      </nav>
      {footer && <div className="mt-auto">{footer}</div>}
    </aside>
  );
}

/** Text pills, the active one filled in ink. */
export function NavPills({ items, as: Component = "a", className }: { items: NavItem[]; as?: ElementType; className?: string }) {
  return (
    <nav aria-label="Main" className={cn("flex gap-1", className)}>
      {items.map(({ label, icon: _icon, active, count: _count, ...linkProps }) => (
        <Component
          key={label}
          aria-current={active ? "page" : undefined}
          className={cn(
            "rounded-full px-4 py-1.5 text-callout font-normal transition-colors",
            active ? "bg-ink text-on-ink" : "text-muted hover:text-ink",
            focusRing,
          )}
          {...linkProps}
        >
          {label}
        </Component>
      ))}
    </nav>
  );
}
