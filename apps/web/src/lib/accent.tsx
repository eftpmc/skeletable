import { type AccentName, accents, defaultAccent, isAccentName } from "@skeleton/ui";
import { type ReactNode, createContext, useContext, useEffect, useState } from "react";

const storageKey = "accent";

type AccentContextValue = { name: AccentName; setName: (name: AccentName) => void };

const AccentContext = createContext<AccentContextValue>({ name: defaultAccent, setName: () => {} });

function stored(): AccentName {
  try {
    const value = localStorage.getItem(storageKey);
    return isAccentName(value) ? value : defaultAccent;
  } catch {
    return defaultAccent;
  }
}

/** The theme color: kept in this browser, applied as --accent / --on-accent on <html>. */
export function AccentProvider({ children }: { children: ReactNode }) {
  const [name, setName] = useState<AccentName>(stored);

  useEffect(() => {
    const { accent, onAccent } = accents[name];
    const root = document.documentElement.style;
    root.setProperty("--accent", accent);
    root.setProperty("--on-accent", onAccent);
    try {
      localStorage.setItem(storageKey, name);
    } catch {
      // Private mode or blocked storage: the color still applies for this visit.
    }
  }, [name]);

  return <AccentContext value={{ name, setName }}>{children}</AccentContext>;
}

export function useAccent() {
  const { name, setName } = useContext(AccentContext);
  return { name, setName, ...accents[name] };
}
