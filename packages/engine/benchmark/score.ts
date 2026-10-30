import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { dirname, resolve, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { catalogRecipeSchema, readFields, readProductPage, reviewedRecipeFor } from "../src/index.js";

const fieldNames = ["title", "price", "currency", "maker", "images", "available", "sku", "gtin", "mpn", "variants", "variantTitles", "variantFacts"] as const;
const labelSchema = z.object({ value: z.unknown(), evidence: z.string().min(10) }).strict()
  .refine((label) => Object.hasOwn(label, "value") && label.value !== undefined, "A label needs an explicit value (null means unknown)");
export const corpusSchema = z.object({
  version: z.literal(1),
  cases: z.array(z.object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    site: z.string().min(1),
    platform: z.enum(["shopify", "non-shopify", "unknown"]),
    platformEvidence: z.string().min(10),
    split: z.enum(["development", "holdout"]),
    file: z.string().min(1),
    url: z.string().url(),
    capturedAt: z.string().datetime(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    kind: z.enum(["product", "negative"]),
    notes: z.string().min(1),
    labels: z.partialRecord(z.enum(fieldNames), labelSchema),
    recipe: catalogRecipeSchema.optional(),
  }).strict()).min(1),
}).strict().superRefine((corpus, context) => {
  const ids = new Set<string>();
  const hashes = new Set<string>();
  const sites = new Map<string, string>();
  for (const item of corpus.cases) {
    if (ids.has(item.id) || hashes.has(item.sha256)) context.addIssue({ code: "custom", message: `Duplicate case or snapshot: ${item.id}` });
    ids.add(item.id); hashes.add(item.sha256);
    if (sites.has(item.site) && sites.get(item.site) !== item.split) context.addIssue({ code: "custom", message: `Site leaks across splits: ${item.site}` });
    sites.set(item.site, item.split);
    if (!Object.keys(item.labels).length) context.addIssue({ code: "custom", message: `Unlabelled case: ${item.id}` });
    if (item.kind === "product" && !["title", "price", "currency"].every((field) => field in item.labels))
      context.addIssue({ code: "custom", message: `Product needs title, price and currency labels: ${item.id}` });
    for (const [field, label] of Object.entries(item.labels)) {
      const value = label.value;
      const valid = value === null || (field === "price" ? typeof value === "number" && Number.isSafeInteger(value) && value >= 0
        : field === "available" ? typeof value === "boolean"
        : field === "images" || field === "variantTitles" ? Array.isArray(value) && value.every((v) => typeof v === "string")
        : field === "variants" || field === "variantFacts" ? Array.isArray(value)
        : typeof value === "string" && value.length > 0);
      if (!valid) context.addIssue({ code: "custom", message: `Invalid ${field} label in ${item.id}` });
    }
  }
});
export type Corpus = z.infer<typeof corpusSchema>;
export type Check = { id: string; site: string; split: string; mode: string; field: string; expected: unknown; actual: unknown; correct: boolean; evidence: string };
export function matches(actual: unknown, expected: unknown): boolean {
  // Only whitespace is normalized. No fuzzy title matches, price tolerance, or unknown-as-false.
  const normalize = (value: unknown): unknown => {
    if (value === undefined) return null;
    if (typeof value === "string") return value.replace(/\s+/g, " ").trim();
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, normalize(v)]));
    return value;
  };
  return isDeepStrictEqual(normalize(actual), normalize(expected));
}

export async function score(manifest: string) {
  const bytes = await readFile(manifest);
  const corpus = corpusSchema.parse(JSON.parse(bytes.toString("utf8")));
  const directory = dirname(resolve(manifest));
  const checks: Check[] = [];
  const pages: { id: string; mode: string; reading: boolean; issues: string[] }[] = [];
  for (const item of corpus.cases) {
    const file = resolve(directory, item.file);
    if (!file.startsWith(directory + sep)) throw new Error(`Snapshot outside corpus: ${item.id}`);
    const htmlBytes = gunzipSync(await readFile(file));
    if (createHash("sha256").update(htmlBytes).digest("hex") !== item.sha256) throw new Error(`Snapshot hash mismatch: ${item.id}`);
    const html = htmlBytes.toString("utf8");
    for (const mode of ["standard", "recipe"] as const) {
      const recipe = mode === "recipe" ? item.recipe ?? reviewedRecipeFor(item.url) : undefined;
      const { fields } = readFields(html, item.url, recipe);
      const { reading, issues } = readProductPage(html, item.url, recipe);
      const actual = { ...fields,
        variantFacts: fields.variants.map((v) => ({ title: v.title, price: v.price?.amount ?? null, currency: v.price?.currency ?? null, available: v.available ?? null, sku: v.sku ?? null, gtin: v.gtin ?? null })).sort((a, b) => a.title.localeCompare(b.title, "en")),
        variantTitles: fields.variants.map((variant) => variant.title).sort(), images: reading?.images?.map((image) => image.url) ?? fields.images };
      pages.push({ id: item.id, mode, reading: reading !== null, issues });
      for (const field of fieldNames) {
        const label = item.labels[field];
        if (!label) continue; // Unreviewed fields are never credited as correct.
        checks.push({ id: item.id, site: item.site, split: item.split, mode, field,
          expected: label.value, actual: actual[field] ?? null, correct: matches(actual[field], label.value), evidence: label.evidence });
      }
      if (item.kind === "negative") checks.push({ id: item.id, site: item.site, split: item.split, mode,
        field: "reading", expected: null, actual: reading, correct: reading === null, evidence: item.notes });
    }
  }
  const summarize = (selected: Check[]) => ({ correct: selected.filter((c) => c.correct).length, total: selected.length });
  const groups: Record<string, ReturnType<typeof summarize>> = {};
  for (const mode of ["standard", "recipe"]) {
    const selected = checks.filter((c) => c.mode === mode);
    groups[mode] = summarize(selected);
    for (const split of ["development", "holdout"]) groups[`${mode}/${split}`] = summarize(selected.filter((c) => c.split === split));
    for (const field of fieldNames) groups[`${mode}/field/${field}`] = summarize(selected.filter((c) => c.field === field));
    for (const site of new Set(corpus.cases.map((c) => c.site))) groups[`${mode}/site/${site}`] = summarize(selected.filter((c) => c.site === site));
  }
  // Canonical JSON avoids false regressions from Git's Windows/Linux line endings.
  return { version: 1, corpusSha256: createHash("sha256").update(JSON.stringify(corpus)).digest("hex"),
    cases: corpus.cases.length, sites: new Set(corpus.cases.map((c) => c.site)).size,
    nonShopifyProductSites: new Set(corpus.cases.filter((c) => c.platform === "non-shopify" && c.kind === "product").map((c) => c.site)).size,
    groups, pages, checks };
}
export type Report = Awaited<ReturnType<typeof score>>;
const key = (check: Check) => `${check.id}/${check.mode}/${check.field}`;
export function regressions(previous: Report, current: Report): string[] {
  if (previous.corpusSha256 !== current.corpusSha256) throw new Error("Corpus changed: review labels and establish a new baseline explicitly");
  const now = new Map(current.checks.map((check) => [key(check), check]));
  if (now.size !== previous.checks.length || previous.checks.some((check) => !now.has(key(check))))
    throw new Error("Scored field coverage changed; do not silently drop checks");
  return previous.checks.filter((check) => check.correct && !now.get(key(check))?.correct).map(key);
}
