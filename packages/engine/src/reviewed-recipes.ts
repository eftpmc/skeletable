import palace from "./palace-us.v1.json" with { type: "json" };
import { recipeSchema } from "./recipes.js";

/** Shipped recipes are code-reviewed; experimental registry proposals never auto-enter this list. */
export const reviewedRecipes = [recipeSchema.parse(palace)];
export function reviewedRecipeFor(url: string) {
  const page = new URL(url);
  return reviewedRecipes.find((r) => r.origin === page.origin && page.pathname.startsWith(r.pathPrefix));
}
