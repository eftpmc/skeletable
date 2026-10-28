import { currencyDigits, toMinorUnits } from "@skeleton/formats";
import { parse, type HTMLElement } from "node-html-parser";
import { z } from "zod";
import { sitemapPages } from "./sitemap-pages.js";
import type { ReadContext, Reader, SamplePage } from "./types.js";

// The recipe format; a recipe states the version it was written for.
export const RECIPE_FORMAT = 1;
// Product pages one crawl reads at most, at the engine's pace (about 2 seconds a page).
const MAX_PAGES = 1000;

const field = z
  .object({
    selector: z.string().min(1).max(240).describe("CSS selector matching exactly one element on a product page"),
    attribute: z.string().min(1).max(80).optional().describe("Read this attribute instead of the element's text, e.g. content or src"),
  })
  .strict();

/**
 * How to read one site that no platform reader covers: data only, never code. Product pages are
 * found in the site's sitemap under `pathPrefix`; each field is read from one element on the page.
 */
export const catalogRecipeSchema = z
  .object({
    format: z.literal(RECIPE_FORMAT),
    pathPrefix: z.string().startsWith("/").min(2).max(160).describe("Product pages' paths start with this, e.g. /shop/"),
    sitemap: z.string().startsWith("/").max(300).optional().describe("Path of the sitemap listing product pages (default: the sitemaps robots.txt names, else /sitemap.xml)"),
    title: field,
    price: field,
    currency: z.union([field, z.object({ constant: z.string().regex(/^[A-Z]{3}$/) }).strict()]),
    image: field,
    description: field.optional(),
    maker: field.optional(),
    available: z
      .object({ field, inStock: z.array(z.string().max(80)).min(1).max(10), outOfStock: z.array(z.string().max(80)).min(1).max(10) })
      .strict()
      .optional(),
  })
  .strict();
export type CatalogRecipe = z.infer<typeof catalogRecipeSchema>;

export type RecipePage = SamplePage;

/**
 * A price as a page shows it ("€1.234,50", "$ 98", "12 500 ¥") in the currency's minor units: the
 * last separator is the decimal point only when the right number of digits follows it.
 */
export function parsePrice(raw: string, currency: string): number | undefined {
  const number = raw.replace(/[\s'\u00a0\u202f]/g, "").match(/\d[\d.,]*/)?.[0];
  if (!number) return undefined;
  const digits = currencyDigits(currency);
  const last = Math.max(number.lastIndexOf("."), number.lastIndexOf(","));
  const after = last >= 0 ? number.length - last - 1 : 0;
  const decimal = last >= 0 && digits > 0 && after >= 1 && after <= digits;
  const whole = (decimal ? number.slice(0, last) : number).replace(/[.,]/g, "");
  return toMinorUnits(decimal ? `${whole}.${number.slice(last + 1)}` : whole, currency);
}

function read(root: HTMLElement, rule: z.infer<typeof field>, name: string, issues: string[]): string | undefined {
  let nodes: HTMLElement[];
  try {
    nodes = root.querySelectorAll(rule.selector);
  } catch {
    issues.push(`${name}: the selector isn't valid`);
    return undefined;
  }
  if (nodes.length !== 1) {
    issues.push(`${name}: expected one element, found ${nodes.length}`);
    return undefined;
  }
  const raw = rule.attribute ? nodes[0]!.getAttribute(rule.attribute) : nodes[0]!.text;
  const value = raw?.replace(/\s+/g, " ").trim();
  if (!value) issues.push(`${name}: empty`);
  return value || undefined;
}

/** One product page read with a recipe: a reading when the essentials came out, and every problem found. */
export function readWithRecipe(html: string, pageUrl: string, recipe: CatalogRecipe): RecipePage {
  const issues: string[] = [];
  const url = new URL(pageUrl);
  if (!url.pathname.startsWith(recipe.pathPrefix)) return { url: pageUrl, reading: null, issues: ["the page isn't under the recipe's pathPrefix"] };
  const root = parse(html);
  root.querySelectorAll("script, style, template, noscript").forEach((el) => el.remove());
  const title = read(root, recipe.title, "title", issues);
  const rawPrice = read(root, recipe.price, "price", issues);
  const currency = "constant" in recipe.currency ? recipe.currency.constant : read(root, recipe.currency, "currency", issues)?.toUpperCase();
  if (currency && !/^[A-Z]{3}$/.test(currency)) issues.push(`currency: "${currency}" isn't a currency code`);
  const validCurrency = currency && /^[A-Z]{3}$/.test(currency) ? currency : undefined;
  const amount = rawPrice && validCurrency ? parsePrice(rawPrice, validCurrency) : undefined;
  if (rawPrice && validCurrency && amount === undefined) issues.push(`price: "${rawPrice}" isn't a price`);
  const image = read(root, recipe.image, "image", issues);
  let imageUrl: string | undefined;
  try {
    imageUrl = image ? new URL(image, url).toString() : undefined;
  } catch {
    issues.push("image: not a link");
  }
  const description = recipe.description ? read(root, recipe.description, "description", issues) : undefined;
  const maker = recipe.maker ? read(root, recipe.maker, "maker", issues) : undefined;
  let available: boolean | undefined;
  if (recipe.available) {
    const value = read(root, recipe.available.field, "available", issues);
    if (value !== undefined) {
      if (recipe.available.inStock.includes(value)) available = true;
      else if (recipe.available.outOfStock.includes(value)) available = false;
      else issues.push(`available: "${value}" is in neither list`);
    }
  }
  if (!title || amount === undefined || !validCurrency || !imageUrl) return { url: pageUrl, reading: null, issues };
  return {
    url: pageUrl,
    reading: {
      // The page's own path is the listing's id: recipe sites have no product ids we can rely on.
      externalId: url.pathname,
      url: `${url.origin}${url.pathname}`,
      title: title.slice(0, 500),
      description: description?.slice(0, 20_000),
      maker: maker?.slice(0, 200),
      price: { amount, currency: validCurrency },
      available,
      images: [{ url: imageUrl }],
    },
    issues,
  };
}

/** The site's product pages, from its sitemaps, under the recipe's pathPrefix. */
export function recipePages(origin: URL, recipe: CatalogRecipe, ctx: ReadContext, max = MAX_PAGES): Promise<string[]> {
  return sitemapPages(origin, ctx, (url) => url.pathname.startsWith(recipe.pathPrefix) && url.pathname !== recipe.pathPrefix, { max, start: recipe.sitemap });
}

/** Sites read with a recipe a contributor wrote and a curator approved. Never detected: only assigned. */
export const recipeReader: Reader = {
  id: "recipe",
  version: 1,
  async detect() {
    return null;
  },
  async *read(origin, config, ctx) {
    const recipe = catalogRecipeSchema.parse(config?.recipe);
    for (const page of await recipePages(origin, recipe, ctx)) {
      let html: string;
      try {
        html = (await ctx.fetch(page, "text/html")).body.toString("utf8");
      } catch {
        continue;
      }
      const { reading } = readWithRecipe(html, page, recipe);
      if (reading) yield reading;
    }
  },
};
