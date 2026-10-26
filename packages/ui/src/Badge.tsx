import type { ReactNode } from "react";
import { cn } from "./cn";

export type PricePillProps = { children: ReactNode; className?: string };

/** The price on a product photo: white pill, bold, top-right. Pass the formatted price. */
export function PricePill({ children, className }: PricePillProps) {
  return (
    <span className={cn("inline-flex rounded-sm bg-on-image px-2 py-1 text-price text-on-image-ink tabular-nums", className)}>
      {children}
    </span>
  );
}

export type BadgeTone = "dark" | "light" | "outline";

export type BadgeProps = { tone?: BadgeTone; children: ReactNode; className?: string };

const tones: Record<BadgeTone, string> = {
  dark: "bg-ink text-on-ink",
  light: "bg-on-image text-on-image-ink",
  outline: "bg-transparent text-ink ring-1 ring-line ring-inset",
};

/**
 * One or two words of meaning: "Good price" (dark), "Used" or "Refurb" (light, on photos),
 * "12 NEW" (dark). At most one badge per photo.
 */
export function Badge({ tone = "dark", children, className }: BadgeProps) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-label", tones[tone], className)}>{children}</span>;
}

/** The red unread dot. Pair it with a count or label so it never carries meaning alone. */
export function Dot({ label = "New" }: { label?: string }) {
  return (
    <span className="inline-flex size-2 shrink-0 rounded-full bg-alert">
      <span className="sr-only">{label}</span>
    </span>
  );
}
