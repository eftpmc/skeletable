import { catalogRecipeSchema, type CatalogRecipe } from "./readers/recipe.js";

/**
 * Recipes shipped with the code for sites whose pages miss data the app needs, by exact origin.
 * Code-reviewed like any change; contributors' recipes live in the hub instead.
 */
const reviewed: { origin: string; recipe: CatalogRecipe }[] = [
  {
    // Palace's product pages carry no structured price.
    origin: "https://usa.palaceskateboards.com",
    recipe: catalogRecipeSchema.parse({
      format: 2,
      pathPrefix: "/products/",
      title: { select: "#product-title" },
      price: { select: "#product-price" },
      currency: { constant: "USD" },
    }),
  },
];

export function reviewedRecipeFor(url: string): CatalogRecipe | undefined {
  const page = new URL(url);
  return reviewed.find((r) => r.origin === page.origin && page.pathname.startsWith(r.recipe.pathPrefix))?.recipe;
}
