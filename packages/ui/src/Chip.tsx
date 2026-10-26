import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn, focusRing } from "./cn";

export type ChipProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Filter chips toggle; pass `selected` and they report `aria-pressed`. */
  selected?: boolean;
  /** `filter` (grey, black when selected) or `shortcut` (always black: home screen categories). */
  variant?: "filter" | "shortcut";
  icon?: ReactNode;
};

/** A pill for filters and shortcuts. One line, sentence case, no icons except Filter and Save search. */
export function Chip({ selected = false, variant = "filter", icon, className, children, type = "button", ...props }: ChipProps) {
  const dark = variant === "shortcut" || selected;
  return (
    <button
      type={type}
      aria-pressed={variant === "filter" ? selected : undefined}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-callout transition-colors",
        variant === "shortcut" && "h-[38px] font-medium",
        dark ? "bg-ink font-medium text-on-ink" : "bg-surface font-normal text-ink",
        focusRing,
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}

/** A row of chips that scrolls sideways on phones. */
export function ChipRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("-mx-4 flex items-center gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none]", className)}>{children}</div>;
}

/** The thin divider between groups of chips. */
export function ChipDivider() {
  return <span aria-hidden="true" className="h-5 w-px shrink-0 bg-line" />;
}
