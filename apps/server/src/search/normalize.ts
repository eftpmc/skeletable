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

const ACCESSORY = /\b(cases?|covers?|replacement|ear ?pads?|cushions?|cables?|chargers?|skins?|stands?|straps?|screen protectors?|decals?)\b/i;

function accessorySubject(text: string): boolean {
  // Included extras don't turn the main product into an accessory ("AirPods with
  // charging case"). "For" alone is common in ordinary product descriptions.
  return ACCESSORY.test(text.split(/\b(?:with|includes?|including)\b/i)[0] ?? text);
}

/** Listings like "Ear pads for Sony WH-1000XM5" mention the product but aren't it. */
export function isAccessoryFor(query: string, title: string): boolean {
  return accessorySubject(title) && !accessorySubject(query);
}

/**
 * Spellings that name the same thing, folded to one form on both sides before matching, so
 * "ps5" finds "PlayStation 5" and "New Balance 990v6" finds "nb 990v6".
 */
const ALIASES: [RegExp, string][] = [
  [/\bgray\b/g, "grey"],
  [/\bplay\s?station\s?(\d)\b/g, "ps$1"],
  [/\bnew balance\b/g, "nb"],
  [/\bair force (?:1|one)\b/g, "af1"],
  [/\b(?:air )?jordan (\d{1,2})\b/g, "aj$1"],
];

/** Words people add to a query that titles often leave out ("airpods pro 2nd gen"). */
const FILLER = new Set(["gen", "generation"]);

/** Words for relevance: aliases folded, ordinals as numbers ("2nd" → "2"), sizes and filler dropped. */
export function matchWords(text: string): string[] {
  let folded = text.toLowerCase().replace(/\bsize\s*:?\s*[0-9][0-9./]*\b/g, " ");
  for (const [pattern, replacement] of ALIASES) folded = folded.replace(pattern, replacement);
  return tokens(folded)
    .map((word) => word.replace(/^(\d+)(?:st|nd|rd|th)$/, "$1"))
    .filter((word) => !FILLER.has(word));
}

/** Words with a digit (model codes, generations, sizes of things): a wrong one means a different product. */
const isCode = (word: string) => /\d/.test(word);

function codeFound(word: string, codes: string[]): boolean {
  return codes.some((code) => code === word || (
    code.endsWith(word) && /\d/.test(code.charAt(code.length - word.length - 1))
  ));
}

function wordFound(word: string, have: Set<string>, codes: string[]): boolean {
  if (have.has(word)) return true;
  const related = equivalents[singular(word)];
  if (related && [...have].some((candidate) => related.includes(singular(candidate)))) return true;
  if (isCode(word)) {
    // Part of a model code: "xm5" in "WH-1000XM5", "wh1000xm5" across "WH-1000XM5".
    if (/[a-z]/.test(word)) return word.length >= 3 && codeFound(word, codes);
    // A number that starts a code: "990" in "990v6", but not "100" in "1000xm5".
    return [...have].some((h) => h.startsWith(word) && /^[a-z]/.test(h.slice(word.length)));
  }
  if (word.length > 3 && word.endsWith("s") && have.has(word.slice(0, -1))) return true;
  // Whole words and simple plurals only: table must not match tablet.
  return word.length > 2 && have.has(`${word}s`);
}

const VARIANTS = new Set(["pro", "max", "plus", "ultra", "mini", "slim"]);
const MODEL_FAMILIES = new Set(["iphone", "ipad", "airpods", "macbook", "galaxy", "surface", "switch"]);
const COLORS = new Set(["black", "white", "grey", "brown", "blue", "navy", "red", "green", "pink", "purple", "yellow", "orange", "beige"]);
const PRODUCT_WORDS = new Set(["shoe", "sneaker", "trainer", "boot", "sock", "jacket", "coat", "shirt", "hoodie", "pant", "jean", "short", "dress", "skirt", "bag", "belt", "hat", "cap", "lamp", "light", "table", "desk", "chair", "sofa", "rug", "headphone", "earbud", "speaker", "camera", "lens", "phone", "tablet", "laptop", "monitor", "keyboard", "mouse"]);
const singular = (word: string) => PRODUCT_WORDS.has(word) ? word : word.endsWith("s") && PRODUCT_WORDS.has(word.slice(0, -1)) ? word.slice(0, -1) : word;
const equivalents: Record<string, string[]> = { shoe: ["shoe", "sneaker", "trainer", "boot"], sneaker: ["sneaker", "trainer", "shoe"], trainer: ["trainer", "sneaker", "shoe"] };

/**
 * Share of query words found in the title (0–1). Used to drop junk and rank results.
 * Missing a word with a digit caps the score below the cut, so "iphone 15 pro" doesn't keep "iPhone 14 Pro".
 */
export function relevance(query: string, title: string, brand: string | null): number {
  const titleWords = [...matchWords(title), ...(brand ? matchWords(brand) : [])];
  const have = new Set(titleWords);
  // Keep code boundaries: XM5 can match WH-1000XM5, but not XM50 or words
  // accidentally concatenated across a title and brand.
  const codes = (title.toLowerCase().match(/\b[a-z0-9]+(?:-[a-z0-9]+)*\b/g) ?? [])
    .map((word) => word.replace(/-/g, ""));
  // A code typed with a space ("990 v6") counts as one word when the title writes it as one.
  const wanted: string[] = [];
  for (const word of matchWords(query)) {
    const previous = wanted.at(-1);
    if (previous && (isCode(previous) || isCode(word)) && !have.has(previous) && codeFound(previous + word, codes)) {
      wanted[wanted.length - 1] = previous + word;
    } else wanted.push(word);
  }
  if (wanted.length === 0) return 0;
  const missed = wanted.filter((word) => !wordFound(word, have, codes));
  const score = (wanted.length - missed.length) / wanted.length;
  const wrongVariant = (wanted.some(isCode) || wanted.some((word) => MODEL_FAMILIES.has(word))) && missed.some((word) => VARIANTS.has(word));
  // A brown jacket isn't a black jacket. Missing color data alone isn't a contradiction.
  const wrongColor = missed.some((word) => COLORS.has(word)) && titleWords.some((word) => COLORS.has(word));
  // The final product noun is usually the object: a table lamp, not a table.
  const subject = wanted.map(singular).findLast((word) => PRODUCT_WORDS.has(word));
  const titleSubjects = new Set(titleWords.map(singular));
  const wrongSubject = subject && !(equivalents[subject] ?? [subject]).some((word) => titleSubjects.has(word));
  return missed.some(isCode) || wrongVariant || wrongColor || wrongSubject ? Math.min(score, 0.5) : score;
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
