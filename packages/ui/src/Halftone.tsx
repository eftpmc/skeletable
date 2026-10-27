import type { CSSProperties } from "react";
import { cn } from "./cn";

type Corner = "top-right" | "top-left" | "bottom-right" | "bottom-left";

const origin: Record<Corner, string> = {
  "top-right": "100% 0%",
  "top-left": "0% 0%",
  "bottom-right": "100% 100%",
  "bottom-left": "0% 100%",
};

/**
 * The brand's halftone, as decoration behind content: two dot screens (the theme color, then black
 * slightly off-register) that fade out from one corner. Fill the parent (it's absolutely placed);
 * keep it to one per view, and keep `reach` small where text sits on top.
 */
export function Halftone({
  corner = "top-right",
  reach = 70,
  ink = true,
  className,
}: {
  corner?: Corner;
  /** How far the dots reach across, as a percentage of the larger side. */
  reach?: number;
  /** Add the black off-register screen (off for small marks). */
  ink?: boolean;
  className?: string;
}) {
  const fade = `radial-gradient(circle at ${origin[corner]}, #000 0%, rgb(0 0 0 / 0.55) ${reach * 0.45}%, transparent ${reach}%)`;
  return (
    <div aria-hidden="true" className={cn("pointer-events-none absolute inset-0 isolate overflow-hidden", className)}>
      <div className="ui-halftone absolute inset-0" style={{ "--dot": "var(--accent)", "--fade": fade } as CSSProperties} />
      {ink && (
        <div
          className="ui-halftone absolute inset-0 mix-blend-multiply"
          style={{ "--dot": "rgb(21 21 21 / 0.85)", "--dot-r": "0.9px", "--fade": fade, transform: "translate(3px, -2px)", opacity: 0.7 } as CSSProperties}
        />
      )}
    </div>
  );
}

/** The wordmark's mark: a corner of the halftone, dots shrinking away from the top left. */
export function BrandMark({ size = 18, className }: { size?: number; className?: string }) {
  const dots = [];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const r = 2.1 - (row + col) * 0.32;
      if (r > 0.35) dots.push(<circle key={`${row}-${col}`} cx={3 + col * 6} cy={3 + row * 6} r={r * 1.25} />);
    }
  }
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" className={cn("shrink-0 fill-accent", className)}>
      {dots}
    </svg>
  );
}
