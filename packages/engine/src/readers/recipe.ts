import { z } from "zod";
import { collectionSchema, ruleSchema, type Rule } from "./fields.js";
import { sitemapPages } from "./sitemap-pages.js";
import { readProductPage } from "./standard.js";
import type { ReadContext, Reader, SamplePage } from "./types.js";

// The recipe format; a recipe states the version it was written for.
export const RECIPE_FORMAT = 2;
// Product pages one crawl reads at most, at the engine's pace (about 2 seconds a page).
const MAX_PAGES = 1000;

const rule = (what: string) => ruleSchema.describe(what);
const currencyRule = z.union([rule("Currency code"), z.object({ constant: z.string().regex(/^[A-Z]{3}$/) }).strict()]);
const stockRule = z.object({ from: rule("Stock assertion"), inStock: z.array(z.string().max(80)).max(10).optional(), outOfStock: z.array(z.string().max(80)).max(10).optional() }).strict();

/**
 * What's special about reading one site: data only, never code. Product pages are found in the site's
 * sitemap under `pathPrefix`. Every field is optional: a field the recipe leaves out, or whose places
 * all come up empty on a page, is read from the page's structured data as for any site. So a recipe
 * says only what the standard reading gets wrong or misses.
 */
export const catalogRecipeSchema = z
  .object({
    format: z.literal(RECIPE_FORMAT),
    pathPrefix: z.string().startsWith("/").min(2).max(160).describe("Product pages' paths start with this, e.g. /shop/"),
    sitemap: z.string().startsWith("/").max(300).optional().describe("Path of the sitemap listing product pages (default: the sitemaps robots.txt names, else /sitemap.xml)"),
    title: rule("The product's name").optional(),
    price: rule("Its current price, as shown or as a number").optional(),
    priceUnit: z.enum(["major", "minor"]).optional().describe('"minor" when the price is a whole number of cents (as Shopify\'s product JSON has it); default "major"'),
    currency: z.union([rule("Its currency code"), z.object({ constant: z.string().regex(/^[A-Z]{3}$/) }).strict()]).optional(),
    image: rule("Its main photo's URL").optional(),
    description: rule("Its description").optional(),
    maker: rule("Who made it, when the shop names a brand").optional(),
    sku: rule("The shop's stock-keeping code").optional(),
    gtin: rule("Its barcode (GTIN, UPC or EAN)").optional(),
    mpn: rule("The maker's part number").optional(),
    variants: z.object({
      from: collectionSchema.describe("DOM row selector or JSON array path; at most 500 rows. JSON row fields use item.* paths."),
      title: rule("Variant label, within the row"),
      price: rule("Variant price, within the row").optional(),
      priceUnit: z.enum(["major", "minor"]).optional(),
      currency: currencyRule.optional(),
      sku: rule("Variant SKU").optional(),
      gtin: rule("Variant barcode").optional(),
      available: stockRule.optional(),
    }).strict().optional(),
    available: z
      .object({
        from: rule("Where the page says whether it's in stock"),
        inStock: z.array(z.string().max(80)).max(10).optional(),
        outOfStock: z.array(z.string().max(80)).max(10).optional(),
      })
      .strict()
      .optional()
      .describe("true/false values are read as they are; text must be in one of the two lists"),
  })
  .strict();
export type CatalogRecipe = z.infer<typeof catalogRecipeSchema>;

// Format 1 (October 2026): one CSS selector per field, title, price, currency and image required.
const v1Field = z.object({ selector: z.string().min(1).max(240), attribute: z.string().min(1).max(80).optional() }).strict();
const v1Schema = z
  .object({
    format: z.literal(1),
    pathPrefix: z.string().startsWith("/").min(2).max(160),
    sitemap: z.string().startsWith("/").max(300).optional(),
    title: v1Field,
    price: v1Field,
    currency: z.union([v1Field, z.object({ constant: z.string().regex(/^[A-Z]{3}$/) }).strict()]),
    image: v1Field,
    description: v1Field.optional(),
    maker: v1Field.optional(),
    available: z.object({ field: v1Field, inStock: z.array(z.string().max(80)).min(1).max(10), outOfStock: z.array(z.string().max(80)).min(1).max(10) }).strict().optional(),
  })
  .strict();

const fromV1 = (field: z.infer<typeof v1Field>): Rule => ({ select: field.selector, ...(field.attribute ? { attribute: field.attribute } : {}) });

/** A format 1 recipe in today's format: the same places, and structured data for anything they miss. */
function upgrade(v1: z.infer<typeof v1Schema>): CatalogRecipe {
  return {
    format: RECIPE_FORMAT,
    pathPrefix: v1.pathPrefix,
    ...(v1.sitemap ? { sitemap: v1.sitemap } : {}),
    title: fromV1(v1.title),
    price: fromV1(v1.price),
    currency: "constant" in v1.currency ? v1.currency : fromV1(v1.currency),
    image: fromV1(v1.image),
    ...(v1.description ? { description: fromV1(v1.description) } : {}),
    ...(v1.maker ? { maker: fromV1(v1.maker) } : {}),
    ...(v1.available ? { available: { from: fromV1(v1.available.field), inStock: v1.available.inStock, outOfStock: v1.available.outOfStock } } : {}),
  };
}

/** A recipe in any format this engine has used, as today's format: what stored recipes are read with. */
export const anyRecipeSchema = z.union([catalogRecipeSchema, v1Schema.transform(upgrade)]);

export type RecipePage = SamplePage;

/** One product page read with a recipe: a reading when the essentials came out, and every problem found. */
export function readWithRecipe(html: string, pageUrl: string, recipe: CatalogRecipe): RecipePage {
  const url = new URL(pageUrl);
  if (!url.pathname.startsWith(recipe.pathPrefix)) return { url: pageUrl, reading: null, issues: ["the page isn't under the recipe's pathPrefix"] };
  const { reading, issues } = readProductPage(html, pageUrl, recipe);
  return { url: pageUrl, reading, issues };
}

/** The site's product pages, from its sitemaps, under the recipe's pathPrefix. */
export function recipePages(origin: URL, recipe: CatalogRecipe, ctx: ReadContext, max = MAX_PAGES): Promise<string[]> {
  return sitemapPages(origin, ctx, (url) => url.pathname.startsWith(recipe.pathPrefix) && url.pathname !== recipe.pathPrefix, { max, start: recipe.sitemap });
}

/** Sites read with a recipe a contributor wrote and a curator approved. Never detected: only assigned. */
export const recipeReader: Reader = {
  id: "recipe",
  version: 2,
  async detect() {
    return null;
  },
  async *read(origin, config, ctx) {
    const recipe = anyRecipeSchema.parse(config?.recipe);
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
