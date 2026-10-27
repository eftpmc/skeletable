import type { ReactNode } from "react";
import { cn } from "./cn";
import { CheckIcon, XIcon } from "./icons";

/**
 * Whether something is on, with words: a filled ink circle with a check, or an outlined circle with
 * an X. The words say what the mark means, so it never relies on the mark (or color) alone.
 */
export function StatusMark({ ok, children, className }: { ok: boolean; children?: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-callout", ok ? "text-ink" : "text-muted", className)}>
      <span
        aria-hidden="true"
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full",
          ok ? "bg-ink text-on-ink" : "border-[1.5px] border-muted/50 text-muted",
        )}
      >
        {ok ? <CheckIcon size={12} strokeWidth={3.2} /> : <XIcon size={11} strokeWidth={3} />}
      </span>
      {children}
    </span>
  );
}
