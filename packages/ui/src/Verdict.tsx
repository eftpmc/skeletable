import { cn } from "./cn";

export type VerdictLabel = "good" | "typical" | "high" | "unknown";

export type VerdictProps = { label: VerdictLabel; text: string; className?: string };

const names: Record<VerdictLabel, string> = { good: "Good price", typical: "Typical price", high: "High price", unknown: "Not enough data" };

/**
 * One line that answers "is this a good price?": a dot plus a plain sentence
 * ("Lowest in 60 days", "Usually $349"). The dot is filled for good, hollow otherwise.
 */
export function Verdict({ label, text, className }: VerdictProps) {
  return (
    <p className={cn("flex items-center gap-2 text-callout text-ink", className)}>
      <span
        aria-hidden="true"
        className={cn("size-2 shrink-0 rounded-full", label === "good" ? "bg-ink" : "ring-[1.5px] ring-ink ring-inset", label === "unknown" && "ring-muted")}
      />
      <span className="sr-only">{names[label]}: </span>
      {text}
    </p>
  );
}
