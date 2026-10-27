import { useSyncExternalStore } from "react";

// Tailwind's lg breakpoint: the sidebar layout.
const wide = window.matchMedia("(min-width: 1024px)");

/** True on wide screens (the sidebar layout), false on phones and narrow windows. */
export function useWide() {
  return useSyncExternalStore(
    (onChange) => {
      wide.addEventListener("change", onChange);
      return () => wide.removeEventListener("change", onChange);
    },
    () => wide.matches,
  );
}
