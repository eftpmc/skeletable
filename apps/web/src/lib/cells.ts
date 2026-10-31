const slugOf = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** How an account's name reads in a sentence. */
export const accountName = (owner: string) => owner.charAt(0).toUpperCase() + owner.slice(1);

/** A cell's address within its table. */
export const cellId = (rowKey: string, columnId: string) => `${slugOf(rowKey)}--${columnId}`;

export const display = (value: string | number | boolean) =>
  typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);

export const day = (date: string) =>
  new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export const host = (url: string) => new URL(url).hostname.replace(/^www\./, "");

/** A page's name without its protocol, for telling pages on one site apart. */
export const place = (url: string) => `${host(url)}${new URL(url).pathname}`.replace(/\/$/, "");

/** Splits a quote around the words that state the value, or returns it whole if they can't be found. */
export function splitQuote(value: string | number | boolean, quote: string): string[] {
  const escaped = String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = typeof value === "number" ? new RegExp(`(?<![\\d.,])${escaped}(?:\\.0+)?(?!\\d)`) : new RegExp(escaped, "i");
  const match = pattern.exec(quote);
  if (!match) return [quote];
  return [quote.slice(0, match.index), match[0], quote.slice(match.index + match[0].length)];
}
