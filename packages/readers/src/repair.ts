import { parse } from "node-html-parser";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { observeDocument, type Document } from "./acquisition.js";
import { digest, extractRecipe, parseAmount, recipeSchema, type Recipe } from "./recipes.js";

const availability = z.enum(["in_stock", "out_of_stock", "unknown"]);
export const expectedProductSchema = z.object({
  title: z.string().min(1), priceCents: z.number().int().nonnegative(), currency: z.string().regex(/^[A-Z]{3}$/),
  availability, variants: z.array(z.object({ label: z.string().min(1), availability }).strict()),
}).strict();
export const fixtureSchema = z.object({
  id: z.string().min(1), document: z.object({ url: z.string().url(), html: z.string(), status: z.number().nullable(), observedAt: z.string(), transport: z.enum(["http", "browser"]) }).strict(),
  expected: expectedProductSchema.nullable(),
}).strict();
export type Fixture = z.infer<typeof fixtureSchema>;

export function validateRecipe(input: Recipe, inputFixtures: Fixture[]) {
  const recipe = recipeSchema.parse(input);
  const fixtures = z.array(fixtureSchema).parse(inputFixtures);
  const issues: string[] = [];
  if (fixtures.length < 3 || new Set(fixtures.map((f) => f.id)).size !== fixtures.length) issues.push("Need at least three uniquely named fixtures");
  if (new Set(fixtures.filter((f) => f.expected).map((f) => f.expected!.title)).size < 2) issues.push("Need at least two distinct product expectations");
  if (new Set(fixtures.map((f) => digest(f.document.html))).size < 3) issues.push("Need at least three distinct page snapshots");
  const cases = fixtures.map((fixture) => {
    const state = observeDocument(fixture.document).state;
    const result = state === "open" ? extractRecipe(fixture.document.html, fixture.document.url, recipe) : null;
    const actual = result?.product ?? null;
    return { id: fixture.id, passed: isDeepStrictEqual(actual, fixture.expected), state, issues: result?.issues ?? [], actual, expected: fixture.expected };
  });
  return { passed: !issues.length && cases.every((c) => c.passed), issues, cases, recipeHash: digest(recipe), fixtureHash: digest(fixtures) };
}
export type Validation = ReturnType<typeof validateRecipe>;

/** Bounded local proposer for simple selector drift. An AI agent can submit the same JSON contract. */
export function suggestRepairs(current: Recipe, changed: Document): Recipe[] {
  if (observeDocument(changed).state !== "open") return [];
  const baseline = extractRecipe(changed.html, changed.url, current);
  if (baseline.product || !baseline.issues.some((s) => s.startsWith("price:"))) return [];
  const root = parse(changed.html);
  root.querySelectorAll("script, style, template, noscript").forEach((el) => el.remove());
  const selectors = new Set<string>();
  for (const node of root.querySelectorAll("[id], [class], [itemprop]")) {
    if (parseAmount(node.text.trim()) === null) continue;
    if (node.getAttribute("itemprop") === "price") selectors.add('[itemprop="price"]');
    const id = node.getAttribute("id");
    if (id && /^[a-zA-Z][\w-]*$/.test(id) && /price/i.test(id)) selectors.add(`#${id}`);
    for (const cls of (node.getAttribute("class") ?? "").split(/\s+/)) {
      if (/^[a-zA-Z][\w-]*$/.test(cls) && /price/i.test(cls)) selectors.add(`.${cls}`);
    }
  }
  return [...selectors].filter((selector) => selector !== current.price.selector).slice(0, 10).map((selector) => ({
    ...current, version: current.version + 1, price: { selector },
  }));
}
