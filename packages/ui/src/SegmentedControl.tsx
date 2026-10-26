import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { cn } from "./cn";

export type Segment = { value: string; label: string; detail?: string; disabled?: boolean };

export type SegmentedControlProps = {
  segments: Segment[];
  value: string;
  onValueChange: (value: string) => void;
  /** `lg`: full width with a second line (New $279 / Refurb $189). `sm`: compact header toggle (Saved / Owned). */
  size?: "lg" | "sm";
  label: string;
  className?: string;
};

/** Pick one of a few views of the same thing. Always has a selection; never more than 4 segments. */
export function SegmentedControl({ segments, value, onValueChange, size = "sm", label, className }: SegmentedControlProps) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      aria-label={label}
      onValueChange={(next) => next && onValueChange(next)}
      className={cn(
        "bg-surface p-1",
        size === "lg" ? "grid auto-cols-fr grid-flow-col gap-1 rounded-xl" : "inline-flex rounded-full",
        className,
      )}
    >
      {segments.map((segment) => (
        <ToggleGroup.Item
          key={segment.value}
          value={segment.value}
          disabled={segment.disabled}
          className={cn(
            "text-ink outline-none transition disabled:opacity-35 data-[state=on]:bg-canvas data-[state=on]:shadow-segment focus-visible:ring-2 focus-visible:ring-focus",
            size === "lg"
              ? "flex h-[52px] flex-col items-center justify-center rounded-md"
              : "h-8 rounded-full px-3.5 text-callout",
          )}
        >
          {size === "lg" ? (
            <>
              <span className="text-footnote text-muted">{segment.label}</span>
              <span className="text-body font-bold tabular-nums">{segment.detail ?? "—"}</span>
            </>
          ) : (
            segment.label
          )}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
