// Mirrors lab/brands/taxonomy.py. The regexes are the same source strings, so a change there needs the same change here.
import type { CategoryId } from "@skeleton/shared";

// Clothing only, as the lab sorted it; other areas are left to models and people.
export const CATEGORY_WORDS: Partial<Record<CategoryId, string>> = {
  dresses: String.raw`dress(es)?|gowns?|jumpsuits?|playsuits?|rompers?|kaftans?|caftans?|sundress(es)?|boiler ?suits?|overalls?|dungarees`,
  skirts: String.raw`skirts?|skorts?|sarongs?|mini skirts?|midi skirts?`,
  tops:
    String.raw`t-?shirts?|tee-?shirts?|kurtas?|tees?|tanks?|tank tops?|tops?|camis?|camisoles?|blouses?|bodysuits?|polos?|polo shirts?|henleys?|` +
    String.raw`long ?sleeves?|l/s tee|s/s tee|bustiers?|corsets?|halters?|tube tops?|crop tops?|singlets?|muscle tees?|tunics?|shells? top`,
  shirts: String.raw`shirts?|button[- ](down|up)s?|overshirts?|flannels?|oxford shirts?|shirting|camp collar|work shirts?`,
  knitwear:
    String.raw`sweaters?|jumpers?|cardigans?|cardis?|knits?|knitwear|pullovers?|turtlenecks?|roll ?necks?|mock ?necks?|` +
    String.raw`sweater vests?|knit vests?|tank knit|polo knit|knitted polo`,
  sweats:
    String.raw`hoodies?|hoody|hooded sweatshirts?|sweatshirts?|crew ?necks?|crews|sweatpants|sweat pants|joggers?|track ?pants|` +
    String.raw`quarter[- ]zips?|half[- ]zips?|zip[- ]ups?|zip hoodies?|sweats|sweat shorts|tracksuits?`,
  outerwear:
    String.raw`jackets?|coats?|parkas?|anoraks?|puffers?|bombers?|trenches|trench coats?|gilets?|vests?|windbreakers?|shackets?|` +
    String.raw`overcoats?|topcoats?|raincoats?|kimonos?|fleeces?|shells?|ponchos?|capes?|chore coats?|field jackets?|down jackets?|liners?|` +
    String.raw`varsity jackets?|denim jackets?|leather jackets?|trucker jackets?|cagoules?|smocks?`,
  tailoring: String.raw`blazers?|suits?|waistcoats?|tuxedos?|sport ?coats?|suit jackets?|suit trousers|tailored jackets?|dinner jackets?`,
  trousers:
    String.raw`pants?|trousers?|capris?|chinos?|slacks|culottes|cargos?|cargo pants|flares|wide[- ]legs?|straight[- ]legs?|carpenter pants|` +
    String.raw`work pants|fatigues|pantalons?`,
  jeans: String.raw`jeans?|denims?|selvedge|5[- ]pockets?`,
  shorts: String.raw`shorts?|bermudas?|short pants|cargo shorts|denim shorts|jorts`,
  activewear:
    String.raw`leggings?|sports? bras?|bike shorts|biker shorts|cycling shorts|running shorts|running tights|yoga pants|` +
    String.raw`active ?wear|track tops?|gym shorts|training tops?|unitards?|catsuits?|base ?layers?`,
  swimwear:
    String.raw`bikinis?|bikini (tops?|bottoms?|briefs?)|swimsuits?|swim ?wear|swim ?shorts|swim ?trunks|trunks|board ?shorts|` +
    String.raw`bathing suits?|one[- ]pieces?|rash ?guards?|swim (tops?|briefs?|bottoms?)|tankinis?|cover[- ]ups?`,
  intimates:
    String.raw`bras?|bralettes?|briefs?|boxers?|boxer briefs?|underwear|undies|panty|panties|thongs?|lingerie|slips?|` +
    String.raw`pyjamas?|pajamas?|pj sets?|robes?|nightgowns?|nightdress(es)?|night ?shirts?|socks?|tights|stockings|` +
    String.raw`loungewear|lounge (pants|sets?)|boyshorts|sleepwear|sleep shirts?|garters?|hosiery|undershirts?|long johns`,
  shoes:
    String.raw`shoes?|sneakers?|trainers?|boots?|loafers?|sandals?|heels|pumps|mules?|clogs?|slides|flats|ballet flats|espadrilles?|` +
    String.raw`slippers?|oxfords|derbys?|derbies|brogues?|mary janes?|kitten heels?|wedges|footwear|moccasins?|flip[- ]flops?|chelsea boots?`,
  bags:
    String.raw`bags?|totes?|tote bags?|backpacks?|clutch(es)?|purses?|crossbody|cross[- ]body bags?|pouch(es)?|duffle?s?|duffel bags?|` +
    String.raw`handbags?|satchels?|rucksacks?|shoulder bags?|bum bags?|fanny packs?|belt bags?|messenger bags?|weekenders?|baguettes?`,
  accessories:
    String.raw`accessor(y|ies)|hair accessories|hats?|caps?|beanies?|bucket hats?|berets?|scarf|scarves|shawls?|stoles?|belts?|ties|neck ?ties?|bow ?ties?|` +
    String.raw`gloves?|mittens?|sunglasses|eyewear|bandanas?|scrunchies?|hair ?clips?|headbands?|hair ?bands?|wallets?|` +
    String.raw`card ?holders?|key ?(rings?|chains?|fobs?)|umbrellas?|balaclavas?|suspenders|braces|pocket squares?|` +
    String.raw`neckerchiefs?|snoods?|ear ?muffs?|visors?|hair ?pins?|barrettes?|watches?|watch straps?|lanyards?|` +
    String.raw`hair (bows?|ties?)|bows?`,
  jewelry:
    String.raw`necklaces?|rings?|earrings?|bracelets?|bangles?|pendants?|chains?|anklets?|brooch(es)?|cuff ?links?|studs?|hoops?|` +
    String.raw`chokers?|charms?|jewell?ery|signets?|ear ?cuffs?|huggies|lockets?|cuffs? bracelets?`,
};

// Not clothing: never offered as products. A title that also names a garment is still clothing.
const OTHER =
  /\b(gift ?cards?|e-?gift|gift certificates?|vouchers?|candles?|mugs?|posters?|prints?|art ?prints?|stickers?|books?|zines?|magazines?|perfumes?|fragrances?|eau de|colognes?|soaps?|towels?|blankets?|pillows?|cushions?|ornaments?|vases?|notebooks?|shipping|insurance|protection|deposits?|samples?|swatch(es)?|mystery|alterations?|hemming|repairs?|custom orders?|donations?|tickets?|tumblers?|bottles?|coasters?|incense|diffusers?|lip ?(balm|stick|gloss)|serums?|creams?|lotions?|candle|keepsakes?|plush|toys?|puzzles?|patch(es)?|pins? badges?|enamel pins?|bundle offer|dog|dogs|pet|pets|collars?|leash(es)?|rugs?|throws?|tapestr(y|ies)|wall art|frames?|cards?|wrapping|gift ?wrap|care kits?|lint|stuffed animals?|trivets?|napkins?|aprons?|workshops?|tableware|shoe care|cleaner|laundry|hangers?|garment bags?|test product|do not (buy|purchase))\b/i;

const KIDS =
  /\b(kids?|kid's|children'?s?|child|baby|babies|toddlers?|infants?|newborns?|youth|juniors?|boys?|girls?|boy's|girl's|little ones?|mini me|bambino|enfants?)\b/i;

const DEPARTMENT_WORDS: [Department, RegExp][] = [
  ["unisex", /\b(unisex|gender[- ]?(neutral|less|free)|all[- ]gender|non[- ]?binary)\b/i],
  ["women", /\b(women'?s?|womens|woman'?s?|womenswear|ladies|lady'?s?|female|femme|for her|wmns|w's)\b/i],
  ["men", /\b(men'?s?|mens|man'?s|menswear|male|homme|for him|gents?|gentlemen)\b/i],
];

// Categories nearly all made for women; a product in one with no other word on it counts as women's.
const WOMEN_CATEGORIES = new Set<string>(["dresses", "skirts"]);
const WOMEN_WORDS =
  /\b(bras?|bralettes?|bikinis?|panty|panties|thongs?|lingerie|bodysuits?|camisoles?|corsets?|bustiers?|blouses?|heels|kitten heels?|mary janes?|tankinis?|sports? bras?|leggings?|nightgowns?|nightdress(es)?)\b/i;

type Department = "women" | "men" | "unisex";

// Alternatives are tried in order, so longer ones go first: "sweater vest" must not stop at "sweater".
function longestFirst(words: string): string {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of words) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "|" && depth === 0) {
      parts.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  parts.push(cur);
  // Array.prototype.sort is stable, as is Python's sorted(), so equal lengths keep their order.
  return parts.sort((a, b) => b.length - a.length).join("|");
}

// Global so matchAll sees every garment word in the text; the "i" flag matches Python's re.I.
const PATTERNS = (Object.entries(CATEGORY_WORDS) as [CategoryId, string][]).map(
  ([cat, words]) => [cat, new RegExp(`\\b(${longestFirst(words)})\\b`, "gi")] as const,
);

// The category of the garment word that ends last in the text, with the longest word winning a tie.
function head(text: string): CategoryId | null {
  let best: { end: number; len: number; cat: CategoryId } | null = null;
  for (const [cat, pattern] of PATTERNS) {
    for (const m of text.matchAll(pattern)) {
      const end = m.index + m[0].length;
      const len = m[0].length;
      if (best === null || end > best.end || (end === best.end && len > best.len)) {
        best = { end, len, cat };
      }
    }
  }
  return best?.cat ?? null;
}

export function cleanTitle(title: string | null | undefined): string {
  // Cut at the first separator so a colour or code after it doesn't read as a garment.
  const t = (title || "").split(/\s+[-–|/]\s+|,\s/)[0] ?? "";
  return t.replace(/\([^)]*\)/g, " ");
}

export function tagList(tags: string[] | string | null | undefined): string[] {
  const list = typeof tags === "string" ? tags.split(",") : (tags ?? []);
  // Tags over 40 characters are sentences, not categories; measure in code points as Python does.
  return list.filter((t) => t && [...t.trim()].length < 40).map((t) => t.trim());
}

export function category(
  title: string | null | undefined,
  productType?: string | null,
  tags?: string[] | string | null,
): { category: CategoryId | "other" | null; how: "type" | "title" | "tags" | null } {
  const text = `${title || ""} ${productType || ""}`;
  if (OTHER.test(text) && head(cleanTitle(title)) === null) return { category: "other", how: "title" };
  // The product type is read first, but only when it names a garment ("FW26" doesn't).
  if (productType) {
    const c = head(productType);
    if (c) return { category: c, how: "type" };
  }
  const fromTitle = head(cleanTitle(title));
  if (fromTitle) return { category: fromTitle, how: "title" };
  const fromRawTitle = head(title || "");
  if (fromRawTitle) return { category: fromRawTitle, how: "title" };
  // Tags only decide when they name exactly one category.
  const found = [...new Set(tagList(tags).map((t) => head(t)))].filter((c): c is CategoryId => c !== null);
  const [only] = found;
  if (found.length === 1 && only) return { category: only, how: "tags" };
  return { category: null, how: null };
}

export function isKids(title: string | null | undefined, productType?: string | null, tags?: string[] | string | null): boolean {
  // Word boundaries in KIDS keep "Boyfriend" and "girlfriend" from matching.
  const text = [title || "", productType || "", ...tagList(tags)].join(" ");
  return KIDS.test(text);
}

export function departmentWords(
  title: string | null | undefined,
  productType?: string | null,
  tags?: string[] | string | null,
): "women" | "men" | "unisex" | null {
  for (const text of [title || "", productType || "", tagList(tags).join(" ")]) {
    const hits = new Set(DEPARTMENT_WORDS.filter(([, pattern]) => pattern.test(text)).map(([dep]) => dep));
    if (hits.has("unisex") || (hits.has("women") && hits.has("men"))) return "unisex";
    if (hits.has("women")) return "women";
    if (hits.has("men")) return "men";
  }
  return null;
}

export function womenByGarment(cat: string | null, title: string | null | undefined): boolean {
  return (cat !== null && WOMEN_CATEGORIES.has(cat)) || WOMEN_WORDS.test(title || "");
}
