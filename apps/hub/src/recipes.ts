import { type HubDb, schema } from "@skeleton/hub-db";
import { and, desc, eq, max } from "drizzle-orm";
import { contributorId, HUB } from "./contributors.js";
import { type CrawlOptions, httpsOrigin } from "./engine/crawl.js";
import { politeContext } from "./engine/polite.js";
import { catalogRecipeSchema, RECIPE_FORMAT, readWithRecipe, recipePages, type RecipePage } from "./readers/recipe.js";
import { assignReader } from "./sources.js";

const { recipe, source } = schema;

// Pages a submitted recipe is tried on, and how many must read cleanly for a curator to see it.
export const SAMPLE_PAGES = 5;
export const MUST_READ = 4;

export class RecipeError extends Error {
  constructor(
    readonly status: 404 | 409 | 422,
    message: string,
  ) {
    super(message);
  }
}

export type RecipeReport = { pagesFound: number; read: number; pages: RecipePage[]; ready: boolean };

/**
 * Try a contributor's recipe on a few of the site's own product pages and keep it as a draft with
 * what came out. A draft that read enough pages waits for a curator; one that didn't is kept with its
 * report, so its author can see what to fix and send a new version.
 */
export async function submitRecipe(
  db: HubDb,
  authorId: string,
  domain: string,
  spec: unknown,
  options: CrawlOptions = {},
): Promise<{ recipeId: string; version: number; report: RecipeReport }> {
  const parsed = catalogRecipeSchema.safeParse(spec);
  if (!parsed.success) throw new RecipeError(422, `the recipe doesn't fit format ${RECIPE_FORMAT}: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  const [site] = await db.select().from(source).where(eq(source.domain, domain));
  if (!site) throw new RecipeError(404, "the hub doesn't know this site yet; propose it first");
  if (site.readerId && site.readerId !== "recipe") throw new RecipeError(409, `this site is already read by the ${site.readerId} reader`);

  const origin = (options.originOf ?? httpsOrigin)(site.domain);
  const ctx = await politeContext(origin, options);
  const found = await recipePages(origin, parsed.data, ctx, 200);
  const pages: RecipePage[] = [];
  for (const url of sample(found, SAMPLE_PAGES)) {
    try {
      pages.push(readWithRecipe((await ctx.fetch(url, "text/html")).body.toString("utf8"), url, parsed.data));
    } catch (error) {
      pages.push({ url, reading: null, issues: [`fetch: ${error instanceof Error ? error.message : "failed"}`] });
    }
  }
  const read = pages.filter((p) => p.reading).length;
  const report: RecipeReport = { pagesFound: found.length, read, pages, ready: read >= Math.min(MUST_READ, found.length) && read > 0 };

  const [last] = await db.select({ version: max(recipe.version) }).from(recipe).where(eq(recipe.sourceId, site.id));
  const version = (last?.version ?? 0) + 1;
  const [made] = await db
    .insert(recipe)
    .values({ sourceId: site.id, version, formatVersion: RECIPE_FORMAT, spec: parsed.data, status: "draft", testReport: report, authorId })
    .returning({ id: recipe.id });
  return { recipeId: made!.id, version, report };
}

/** Pages spread through the list rather than its first few, which are often the same collection. */
function sample<T>(items: T[], n: number): T[] {
  if (items.length <= n) return items;
  return Array.from({ length: n }, (_, i) => items[Math.floor((i * items.length) / n)]!);
}

/** Drafts that read enough of their sample pages, newest first, with their site and report. */
export async function pendingRecipes(db: HubDb) {
  const drafts = await db
    .select({ id: recipe.id, domain: source.domain, siteStatus: source.status, version: recipe.version, spec: recipe.spec, report: recipe.testReport, authorId: recipe.authorId, createdAt: recipe.createdAt })
    .from(recipe)
    .innerJoin(source, eq(source.id, recipe.sourceId))
    .where(eq(recipe.status, "draft"))
    .orderBy(desc(recipe.createdAt))
    .limit(100);
  return drafts.filter((d) => (d.report as RecipeReport | null)?.ready);
}

/**
 * A curator's call on a draft. Approved, it becomes the site's live recipe (any earlier one retires),
 * the site is read with it from the next crawl, and a candidate site is approved with it: the sample
 * products are what the curator judged. Declined, it retires.
 */
export async function decideRecipe(db: HubDb, recipeId: string, approve: boolean) {
  return db.transaction(async (tx) => {
    const [draft] = await tx.select().from(recipe).where(and(eq(recipe.id, recipeId), eq(recipe.status, "draft")));
    if (!draft || (approve && !(draft.testReport as RecipeReport | null)?.ready)) return null;
    if (!approve) {
      await tx.update(recipe).set({ status: "retired" }).where(eq(recipe.id, recipeId));
      return { id: recipeId, status: "retired" as const };
    }
    await tx.update(recipe).set({ status: "retired" }).where(and(eq(recipe.sourceId, draft.sourceId), eq(recipe.status, "live")));
    await tx.update(recipe).set({ status: "live" }).where(eq(recipe.id, recipeId));
    await assignReader(tx as unknown as HubDb, draft.sourceId, "recipe", {
      evidence: { recipeId, version: draft.version },
      config: { recipe: draft.spec, recipeId },
      by: await contributorId(tx as unknown as HubDb, HUB.handle, HUB.kind),
    });
    await tx.update(source).set({ status: "approved", nextCrawlAt: new Date() }).where(and(eq(source.id, draft.sourceId), eq(source.status, "candidate")));
    return { id: recipeId, status: "live" as const };
  });
}
