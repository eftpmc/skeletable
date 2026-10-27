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
