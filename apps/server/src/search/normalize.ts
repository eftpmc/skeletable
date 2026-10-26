import type { Condition } from "@closet/shared";

const STOP_WORDS = new Set(["the", "a", "an", "and", "for", "with", "of", "in", "by", "new", "brand"]);

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((token) => token && !STOP_WORDS.has(token));
}

/**
 * The fallback key for "is this the same product?" when there's no GTIN or MPN:
 * brand plus title with condition words and bracketed notes removed.
 */
export function matchKey(brand: string | null, title: string): string {
  const cleaned = title
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/\b(certified|refurbished|renewed|used|pre-owned|open box|excellent|good|fair)\b/gi, " ");
  const words = [...new Set([...(brand ? tokens(brand) : []), ...tokens(cleaned)])];
  return words.join(" ");
}

/**
 * The model code in a title, if it has one: a word mixing letters and digits, at least
 * 4 characters once hyphens are dropped ("WH-1000XM5" → "wh1000xm5", "MX Master 3S" → none).
 */
export function modelCode(title: string): string | null {
  const word = modelWord(title);
  return word ? word.replace(/-/g, "").toLowerCase() : null;
}

/** The model code as written in the title ("WH-1000XM5"), for building a search query. */
export function modelWord(title: string): string | null {
  const candidates = title.match(/\b[a-z0-9]+(?:-[a-z0-9]+)*\b/gi) ?? [];
  const codes = candidates.filter((word) => {
    const bare = word.replace(/-/g, "");
    return bare.length >= 4 && /[a-z]/i.test(bare) && /\d/.test(bare);
  });
  return codes.sort((a, b) => b.length - a.length)[0] ?? null;
}

const ACCESSORY = /\b(case|cover|replacement|ear ?pads?|cushions?|cable|charger|skin|stand|strap|screen protector|decal)\b|\bfor\s+(?:the\s+)?[a-z]/i;

/** Listings like "Ear pads for Sony WH-1000XM5" mention the product but aren't it. */
export function isAccessoryFor(query: string, title: string): boolean {
  return ACCESSORY.test(title) && !ACCESSORY.test(query);
}

/** Share of query words found in the title (0–1). Used to drop junk and rank results. */
export function relevance(query: string, title: string, brand: string | null): number {
  const wanted = tokens(query);
  if (wanted.length === 0) return 0;
  const have = new Set([...tokens(title), ...(brand ? tokens(brand) : [])]);
  const hits = wanted.filter((word) => have.has(word) || (word.length > 3 && [...have].some((h) => h.startsWith(word))));
  return hits.length / wanted.length;
}

/** Map a store's condition wording to ours. */
export function parseCondition(text: string | null | undefined): Condition {
  const value = (text ?? "").toLowerCase();
  if (/refurb|renewed|reconditioned|remanufactured/.test(value)) return "refurb";
  if (/used|pre-?owned|second|vintage|open box|like new|good|fair|acceptable/.test(value)) return "used";
  return "new";
}

export function dollarsToCents(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number.parseFloat(String(value).replace(/[^0-9.]/g, ""));
  return Number.isFinite(number) && number > 0 ? Math.round(number * 100) : null;
}

export function normalizeGtin(value: unknown): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 14) return null;
  // Store as GTIN-14 so UPC-A, EAN-13 and GTIN-14 forms of the same code match.
  return digits.padStart(14, "0");
}
