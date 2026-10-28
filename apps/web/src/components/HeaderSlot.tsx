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

/** Back, at the start of the wide-screen header: a round button the size and colour of the search bar. */
export function HeaderBack({ onBack, label = "Back" }: { onBack: () => void; label?: string }) {
  return (
    <HeaderSlot side="start">
      <button
        type="button"
        onClick={onBack}
        aria-label={label}
        title={label}
        className={cn("inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-ink hover:bg-line/60", focusRing)}
      >
        <ChevronLeftIcon size={22} />
      </button>
    </HeaderSlot>
  );
}
