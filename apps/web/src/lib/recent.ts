import { useSyncExternalStore } from "react";

// Recent searches stay in this browser only: they're a shortcut, not a record.
const KEY = "skeleton.recent-searches";
const MAX = 8;
const listeners = new Set<() => void>();
let cache: string[] | null = null;

function read(): string[] {
  if (cache) return cache;
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    cache = Array.isArray(parsed) ? parsed.filter((q): q is string => typeof q === "string") : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(next: string[]) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private windows and blocked storage: keep them for this visit only.
  }
  listeners.forEach((listener) => listener());
}

/** Newest first, without repeats (ignoring case). */
export function rememberSearch(q: string) {
  const text = q.trim();
  if (!text) return;
  write([text, ...read().filter((r) => r.toLowerCase() !== text.toLowerCase())].slice(0, MAX));
}

export function clearRecentSearches() {
  write([]);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useRecentSearches() {
  return useSyncExternalStore(subscribe, read, () => []);
}
