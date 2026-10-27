import * as Dropdown from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * A menu that opens from a button: the account menu, row actions. Arrow keys move, Enter picks,
 * Escape closes. Pass the button as `trigger`; it keeps its own look.
 */
export function Menu({
  trigger,
  children,
  side = "top",
  align = "start",
  className,
}: {
  trigger: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  className?: string;
}) {
  return (
    <Dropdown.Root modal={false}>
      <Dropdown.Trigger asChild>{trigger}</Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          side={side}
          align={align}
          sideOffset={8}
          collisionPadding={12}
          className={cn(
            "ui-rise-in z-50 min-w-[240px] rounded-xl border border-line bg-canvas p-1.5 text-ink shadow-field outline-none",
            className,
          )}
        >
          {children}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}

/** One choice. For a link, pass `asChild` and the link as the child (put its icon inside it). */
export function MenuItem({
  icon,
  children,
  onSelect,
  asChild,
  tone = "default",
}: {
  icon?: ReactNode;
  children: ReactNode;
  onSelect?: () => void;
  asChild?: boolean;
  tone?: "default" | "muted";
}) {
  return (
    <Dropdown.Item
      asChild={asChild}
      onSelect={onSelect}
      className={cn(
        "flex h-10 cursor-pointer items-center gap-3 rounded-lg px-2.5 text-callout outline-none select-none data-[highlighted]:bg-surface",
        tone === "muted" ? "text-muted data-[highlighted]:text-ink" : "text-ink",
        "[&>svg]:shrink-0",
      )}
    >
      {asChild ? (
        children
      ) : (
        <span className="flex w-full items-center gap-3">
          {icon}
          {children}
        </span>
      )}
    </Dropdown.Item>
  );
}

/** Who or what the menu is about, at its top. Not selectable. */
export function MenuHeader({ children }: { children: ReactNode }) {
  return <div className="px-2.5 pt-1.5 pb-2">{children}</div>;
}

export function MenuSeparator() {
  return <Dropdown.Separator className="my-1.5 h-px bg-line" />;
}
