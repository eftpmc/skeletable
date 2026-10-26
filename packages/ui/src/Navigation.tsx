import type { ElementType, ReactNode } from "react";
import { cn, focusRing } from "./cn";

export type NavItem = {
  label: string;
  icon: (props: { size?: number; strokeWidth?: number }) => ReactNode;
  active?: boolean;
  /** Shows the red dot on the icon (unread alerts). */
  dot?: boolean;
  [linkProp: string]: unknown;
};

/**
 * The phone tab bar: four icons, no labels (labels go to screen readers). The active icon is
 * drawn heavier, not colored. Pass `as={Link}` and give each item its `to`.
 */
export function TabBar({ items, as: Component = "a", className }: { items: NavItem[]; as?: ElementType; className?: string }) {
  return (
    <nav aria-label="Main" className={cn("border-t border-line bg-canvas/95 pb-[env(safe-area-inset-bottom)] backdrop-blur", className)}>
      <div className="mx-auto flex max-w-md justify-around">
        {items.map(({ label, icon: Icon, active, dot, ...linkProps }) => (
          <Component
            key={label}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            className={cn("relative flex h-14 flex-1 items-center justify-center", active ? "text-ink" : "text-muted", focusRing)}
            {...linkProps}
          >
            <Icon size={26} strokeWidth={active ? 2.6 : 1.8} />
            {dot && <span aria-hidden="true" className="absolute top-3 left-1/2 ml-2 size-[9px] rounded-full bg-alert" />}
          </Component>
        ))}
      </div>
    </nav>
  );
}

/** The desktop version of the tab bar: text pills, the active one filled in ink. */
export function NavPills({ items, as: Component = "a", className }: { items: Omit<NavItem, "icon">[]; as?: ElementType; className?: string }) {
  return (
    <nav aria-label="Main" className={cn("flex gap-1", className)}>
      {items.map(({ label, active, dot: _dot, ...linkProps }) => (
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
