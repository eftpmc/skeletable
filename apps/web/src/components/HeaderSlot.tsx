import { ChevronLeftIcon, cn, focusRing } from "@skeleton/ui";
import { createContext, type ReactNode, useContext } from "react";
import { createPortal } from "react-dom";

type Slots = { start: HTMLElement | null; end: HTMLElement | null };

/** The two ends of the wide-screen header around search, which the page on show can fill. */
export const HeaderSlotContext = createContext<Slots>({ start: null, end: null });

/**
 * Put a page's own controls in the wide-screen header: before search (`start`: where you came from,
 * what this is) or after it (`end`: results put their filters there). Narrow screens have no such
 * header, so pages keep their own place for these as well.
 */
export function HeaderSlot({ side = "end", children }: { side?: "start" | "end"; children: ReactNode }) {
  const slot = useContext(HeaderSlotContext)[side];
  return slot ? createPortal(children, slot) : null;
}

/** Back, and what this page is, at the start of the wide-screen header. */
export function HeaderBack({ onBack, label = "Back", title }: { onBack: () => void; label?: string; title?: string }) {
  return (
    <HeaderSlot side="start">
      <button
        type="button"
        onClick={onBack}
        aria-label={label}
        className={cn("-ml-2 inline-flex h-10 shrink-0 items-center gap-1 rounded-full pr-3 pl-1 text-callout font-normal text-muted hover:bg-surface hover:text-ink", focusRing)}
      >
        <ChevronLeftIcon size={20} />
        {title ? null : label}
      </button>
      {title && <span className="max-w-[240px] truncate text-body font-semibold text-ink">{title}</span>}
    </HeaderSlot>
  );
}
