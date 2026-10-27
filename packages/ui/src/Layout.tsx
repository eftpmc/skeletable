import type { ElementType, ReactNode } from "react";
import { cn, focusRing } from "./cn";
import { Halftone } from "./Halftone";

export type SectionHeaderProps = {
  title: ReactNode;
  /** "See all" link on the right. */
  action?: { label: string; as?: ElementType; [linkProp: string]: unknown };
  className?: string;
};

/** A section title in `title-2`, with an optional muted action on the right. */
export function SectionHeader({ title, action, className }: SectionHeaderProps) {
  const { label, as: Action = "a", ...actionProps } = action ?? { label: "" };
  return (
    <div className={cn("flex items-baseline justify-between gap-4", className)}>
      <h2 className="text-title-2 text-ink">{title}</h2>
      {action && (
        <Action className={cn("rounded-full text-callout font-normal text-muted hover:text-ink", focusRing)} {...actionProps}>
          {label}
        </Action>
      )}
    </div>
  );
}

/** A screen's title in `title-1`, with optional controls on the right (Edit, a segmented toggle). */
export function ScreenTitle({ children, trailing, className }: { children: ReactNode; trailing?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      <h1 className="text-title-1 text-ink">{children}</h1>
      {trailing}
    </div>
  );
}

/** What a screen shows when there's nothing yet: say what will appear and how to get it. */
export function EmptyState({ title, body, action, className }: { title: string; body: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("relative flex flex-col items-center overflow-hidden rounded-xl bg-surface px-6 py-14 text-center", className)}>
      <Halftone corner="top-right" reach={38} ink={false} className="opacity-50" />
      <p className="relative text-title-3 text-ink">{title}</p>
      <p className="relative mt-1 max-w-xs text-callout font-normal text-muted">{body}</p>
      {action && <div className="relative mt-5">{action}</div>}
    </div>
  );
}

/** Loading placeholder in `surface`. Give it the size of what's coming. */
export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-lg bg-surface", className)} style={style} />;
}

/** Initial (or photo) in a circle. */
export function Avatar({ name, image, size = 40 }: { name: string; image?: string | null; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface text-callout text-ink"
      style={{ width: size, height: size }}
    >
      {image ? <img src={image} alt="" className="size-full object-cover" /> : name.charAt(0).toUpperCase()}
    </span>
  );
}
