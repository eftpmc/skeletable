import type { Verdict } from "@closet/shared";

const money = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;

/**
 * Is this a good price? Prefer our own price history; with too little history,
 * compare against the other current offers.
 *
 * @param current  the best current price
 * @param history  daily lowest prices over the last 60 days (oldest first)
 * @param others   other current prices for the same product and condition
 */
export function verdictFor(current: number, history: number[], others: number[]): Verdict {
  if (history.length >= 3) {
    const low = Math.min(...history);
    const sorted = [...history].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    if (current <= low * 1.02) return { label: "good", text: "Lowest in 60 days" };
    if (current > median * 1.1) return { label: "high", text: `Usually ${money(median)}` };
    return { label: "typical", text: `Usually ${money(median)}` };
  }

  const next = others.filter((price) => price > current).sort((a, b) => a - b)[0];
  if (next !== undefined) {
    const saving = next - current;
    if (saving >= Math.max(500, next * 0.05)) return { label: "good", text: `${money(saving)} less than the next store` };
    return { label: "typical", text: "About the same everywhere" };
  }
  if (others.length > 0) return { label: "typical", text: "Same price at other stores" };
  return { label: "unknown", text: "Only one store so far" };
}
