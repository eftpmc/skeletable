import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn, focusRing } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "quiet";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  /** Full width of its container (bottom action bars). */
  block?: boolean;
  icon?: ReactNode;
};

const variants: Record<ButtonVariant, string> = {
  primary: "h-[52px] rounded-xl bg-ink px-5 text-body font-semibold text-on-ink",
  secondary: "h-[52px] rounded-xl bg-surface px-5 text-body font-semibold text-ink",
  quiet: "h-11 rounded-full px-3 text-callout font-normal text-muted hover:text-ink",
};

/** Button styles for things that must be links, like "Buy at Best Buy" opening the store. */
export function buttonClass({ variant = "primary", block, className }: { variant?: ButtonVariant; block?: boolean; className?: string } = {}) {
  return cn(
    "inline-flex shrink-0 items-center justify-center gap-2 transition-opacity disabled:opacity-40",
    variants[variant],
    block && "w-full",
    focusRing,
    className,
  );
}

/** Primary actions are black and say exactly what happens ("Buy at Best Buy"). */
export function Button({ variant = "primary", block, icon, className, children, type = "button", ...props }: ButtonProps) {
  return (
    <button type={type} className={buttonClass({ variant, block, className })} {...props}>
      {icon}
      {children}
    </button>
  );
}

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Required: icon-only buttons need a name for screen readers. */
  label: string;
  /** `plain` on canvas, `surface` filled, `floating` white over photos. */
  tone?: "plain" | "surface" | "floating";
  size?: "md" | "lg";
  children: ReactNode;
};

const tones = {
  plain: "bg-transparent text-ink",
  surface: "bg-surface text-ink",
  floating: "bg-on-image text-on-image-ink shadow-float",
};

export function IconButton({ label, tone = "plain", size = "md", className, children, type = "button", ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        size === "lg" ? "size-[52px] rounded-xl" : "size-10 rounded-full",
        tones[tone],
        focusRing,
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
