import { type Category, type ColorName, colorNames } from "@closet/shared";

// When a title names several garments, the last one wins:
// "Shirt Jacket" is outerwear and "Sneaker Socks" are accessories.
const categoryKeywords: [Category, string[]][] = [
  ["accessories", ["sock", "socks", "belt", "hat", "cap", "beanie", "scarf", "glove", "gloves", "sunglasses", "watch", "ring", "necklace", "bracelet", "tie", "wallet", "keychain", "earring", "earrings"]],
  ["bags", ["bag", "backpack", "tote", "duffel", "duffle", "crossbody", "purse", "handbag", "messenger", "satchel", "pouch"]],
  ["shoes", ["shoe", "shoes", "sneaker", "sneakers", "trainer", "trainers", "boot", "boots", "loafer", "loafers", "sandal", "sandals", "slide", "slides", "clog", "clogs", "derby", "oxford", "mule", "mules", "runner"]],
  ["outerwear", ["jacket", "coat", "parka", "puffer", "anorak", "windbreaker", "blazer", "overcoat", "trench", "gilet", "vest", "bomber", "shacket", "overshirt", "fleece", "peacoat", "raincoat"]],
  ["dresses", ["dress", "gown", "jumpsuit", "romper", "overalls", "skirt"]],
  ["bottoms", ["pant", "pants", "jean", "jeans", "trouser", "trousers", "chino", "chinos", "short", "shorts", "jogger", "joggers", "sweatpants", "cargo", "cargos", "legging", "leggings", "denim"]],
  ["tops", ["shirt", "tee", "t-shirt", "tshirt", "top", "polo", "sweater", "sweatshirt", "hoodie", "crewneck", "cardigan", "henley", "tank", "jersey", "knit", "pullover", "turtleneck", "blouse", "flannel", "oxford shirt", "longsleeve"]],
];

export function guessCategory(...texts: (string | null | undefined)[]): Category | null {
  const words = tokenize(texts.filter(Boolean).join(" "));
  if (words.length === 0) return null;
  const joined = ` ${words.join(" ")} `;
  let best: { category: Category; position: number } | null = null;
  for (const [category, keywords] of categoryKeywords) {
    for (const keyword of keywords) {
      const position = joined.lastIndexOf(` ${keyword} `);
      if (position >= 0 && (!best || position > best.position)) best = { category, position };
    }
  }
  return best?.category ?? null;
}

const colorAliases: Record<string, ColorName> = {
  jet: "black",
  onyx: "black",
  ink: "navy",
  midnight: "navy",
  indigo: "navy",
  "dark navy": "navy",
  gray: "grey",
  heather: "grey",
  silver: "grey",
  "light grey": "grey",
  "light gray": "grey",
  "dark grey": "charcoal",
  "dark gray": "charcoal",
  slate: "charcoal",
  ivory: "cream",
  ecru: "cream",
  "off white": "cream",
  "off-white": "cream",
  bone: "cream",
  natural: "beige",
  sand: "beige",
  stone: "beige",
  khaki: "beige",
  oat: "beige",
  oatmeal: "beige",
  camel: "tan",
  caramel: "tan",
  chocolate: "brown",
  coffee: "brown",
  mocha: "brown",
  espresso: "brown",
  cognac: "brown",
  "sky blue": "light blue",
  "baby blue": "light blue",
  "powder blue": "light blue",
  denim: "blue",
  cobalt: "blue",
  royal: "blue",
  forest: "green",
  sage: "green",
  emerald: "green",
  moss: "olive",
  army: "olive",
  military: "olive",
  maroon: "burgundy",
  wine: "burgundy",
  oxblood: "burgundy",
  crimson: "red",
  scarlet: "red",
  rose: "pink",
  blush: "pink",
  lavender: "purple",
  lilac: "purple",
  plum: "purple",
  mustard: "yellow",
  gold: "yellow",
  rust: "orange",
  coral: "orange",
};

/** Map a retailer's color name ("Midnight Navy", "Off-White") to our palette. */
export function parseColorNames(text: string | null | undefined): ColorName[] {
  if (!text) return [];
  const lower = ` ${text.toLowerCase().replace(/[^a-z\s-]/g, " ").replace(/\s+/g, " ").trim()} `;
  const found: { name: ColorName; position: number }[] = [];
  const candidates: [string, ColorName][] = [
    ...colorNames.map((name) => [name, name] as [string, ColorName]),
    ...Object.entries(colorAliases),
  ];
  // Longer phrases first so "light blue" wins over "blue".
  candidates.sort((a, b) => b[0].length - a[0].length);
  let remaining = lower;
  for (const [phrase, name] of candidates) {
    const position = remaining.indexOf(` ${phrase} `);
    if (position >= 0) {
      if (!found.some((entry) => entry.name === name)) found.push({ name, position });
      remaining = remaining.replace(` ${phrase} `, ` ${"_".repeat(phrase.length)} `);
    }
  }
  return found.sort((a, b) => a.position - b.position).map((entry) => entry.name).slice(0, 3);
}

function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}
