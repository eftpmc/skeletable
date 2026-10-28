import { createContext, type ReactNode, useContext } from "react";
import { createPortal } from "react-dom";

/** The right side of the wide-screen header, which the page on show can fill (null until it mounts). */
export const HeaderSlotContext = createContext<HTMLElement | null>(null);

/**
 * Put a page's own controls in the wide-screen header, beside search: results put their filters
 * there. Narrow screens have no such header, so pages keep their own bar for them as well.
 */
export function HeaderSlot({ children }: { children: ReactNode }) {
  const slot = useContext(HeaderSlotContext);
  return slot ? createPortal(children, slot) : null;
}
