/** Theme colors a person can pick. The first is the default and matches `accent` in tokens.json. */
export const accents = {
  pink: { label: "Pink", accent: "#ff48b0", onAccent: "#000000" },
  blue: { label: "Blue", accent: "#0078bf", onAccent: "#ffffff" },
  orange: { label: "Orange", accent: "#ff6c2f", onAccent: "#000000" },
} as const;

export type AccentName = keyof typeof accents;

export const defaultAccent: AccentName = "pink";

export function isAccentName(value: unknown): value is AccentName {
  return typeof value === "string" && value in accents;
}
