import { useState } from "react";

const prefersDark = () => {
  try {
    const saved = localStorage.getItem("theme");
    if (saved) return saved === "dark";
  } catch {
    // Storage can be blocked; the system setting still applies.
  }
  return matchMedia("(prefers-color-scheme: dark)").matches;
};

const apply = (dark: boolean) => document.documentElement.classList.toggle("dark", dark);

apply(prefersDark());

export function useTheme() {
  const [dark, setDark] = useState(prefersDark);
  const toggle = () => {
    apply(!dark);
    setDark(!dark);
    try {
      localStorage.setItem("theme", dark ? "light" : "dark");
    } catch {
      // The choice just won't outlast this page.
    }
  };
  return { dark, toggle };
}
