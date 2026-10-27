import { createHash } from "node:crypto";
import { parse, type HTMLElement } from "node-html-parser";
import { z } from "zod";

const fieldSchema = z.object({ selector: z.string().min(1).max(240), attribute: z.string().min(1).max(80).optional() }).strict();
const stockSchema = z.object({
  field: fieldSchema,
  inStock: z.array(z.string()).min(1), outOfStock: z.array(z.string()).min(1),
}).strict().refine((s) => !s.inStock.some((v) => s.outOfStock.includes(v)), "Stock values must not overlap");

/** Data only: recipes cannot execute code or supply network/credential settings. */
export const recipeSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/).max(80), version: z.number().int().positive(),
  origin: z.string().url().refine((s) => { const u = new URL(s); return u.protocol === "https:" && u.origin === s; }, "Exact HTTPS origin required"),
  pathPrefix: z.string().startsWith("/").min(2).max(160),
  title: fieldSchema, price: fieldSchema,
  currency: z.union([fieldSchema, z.object({ constant: z.enum(["USD", "EUR", "GBP", "CAD", "AUD", "JPY"]) }).strict()]),
  stock: stockSchema.optional(),
  variants: z.object({ selector: z.string().min(1).max(240), label: fieldSchema, stock: stockSchema.optional() }).strict().optional(),
}).strict();
export type Recipe = z.infer<typeof recipeSchema>;
export type Availability = "in_stock" | "out_of_stock" | "unknown";
export type ExtractedProduct = {
  title: string; priceCents: number; currency: string; availability: Availability;
  variants: { label: string; availability: Availability }[];
};
export type Evidence = { field: string; selector: string; attribute?: string; raw: string };
export type Extraction = {
  product: ExtractedProduct | null; issues: string[]; evidence: Evidence[];
  recipeHash: string; documentHash: string;
};
export const digest = (value: unknown) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

/** Strict US-style amounts for this initial recipe format; reject installment/range ambiguity. */
export function parseAmount(raw: string): number | null {
  const text = raw.replace(/\u00a0/g, " ").trim();
  const match = text.match(/^(?:(?:USD|CAD|AUD|EUR|GBP|JPY|US\$|CA\$|AU\$|[$€£¥])\s*)?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)(?:\s*(?:USD|CAD|AUD|EUR|GBP|JPY))?$/);
  if (!match) return null;
  const value = Math.round(Number(match[1]!.replace(/,/g, "")) * 100);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function readField(root: HTMLElement, rule: z.infer<typeof fieldSchema>, field: string, evidence: Evidence[], issues: string[]) {
  let nodes: HTMLElement[];
  try { nodes = rule.selector === ":scope" ? [root] : root.querySelectorAll(rule.selector); }
  catch { issues.push(`${field}: invalid selector`); return null; }
  if (nodes.length !== 1) { issues.push(`${field}: expected one element, found ${nodes.length}`); return null; }
  const raw = rule.attribute ? nodes[0]!.getAttribute(rule.attribute) : nodes[0]!.text;
  if (raw === undefined || raw.trim() === "") { issues.push(`${field}: missing value`); return null; }
  const value = raw.replace(/\s+/g, " ").trim();
  if (value.length > 500) { issues.push(`${field}: value too long`); return null; }
  evidence.push({ field, ...rule, raw: value });
  return value;
}

function stock(root: HTMLElement, rule: z.infer<typeof stockSchema> | undefined, field: string, evidence: Evidence[], issues: string[]): Availability {
  if (!rule) return "unknown";
  const value = readField(root, rule.field, field, evidence, issues);
  if (value === null) return "unknown";
  if (rule.inStock.includes(value)) return "in_stock";
  if (rule.outOfStock.includes(value)) return "out_of_stock";
  issues.push(`${field}: unrecognized availability value`);
  return "unknown";
}

export function extractRecipe(html: string, url: string, input: Recipe): Extraction {
  const recipe = recipeSchema.parse(input);
  const result: Extraction = { product: null, issues: [], evidence: [], recipeHash: digest(recipe), documentHash: digest(html) };
  const pageUrl = new URL(url);
  if (pageUrl.origin !== recipe.origin || !pageUrl.pathname.startsWith(recipe.pathPrefix)) {
    result.issues.push("scope: page does not match recipe"); return result;
  }
  const root = parse(html);
  root.querySelectorAll("script, style, template, noscript").forEach((el) => el.remove());
  const title = readField(root, recipe.title, "title", result.evidence, result.issues);
  const rawPrice = readField(root, recipe.price, "price", result.evidence, result.issues);
  const priceCents = rawPrice === null ? null : parseAmount(rawPrice);
  if (rawPrice !== null && priceCents === null) result.issues.push("price: ambiguous or invalid amount");
  const currency = "constant" in recipe.currency ? recipe.currency.constant
    : readField(root, recipe.currency, "currency", result.evidence, result.issues);
  if ("constant" in recipe.currency) result.evidence.push({ field: "currency", selector: "recipe configuration", raw: recipe.currency.constant });
  if (!currency || !/^[A-Z]{3}$/.test(currency)) result.issues.push("currency: invalid code");
  // Reject explicit currency disagreement; a bare dollar sign remains region-dependent.
  const stated = rawPrice?.match(/\b(USD|CAD|AUD|EUR|GBP|JPY)\b/)?.[1];
  if (stated && stated !== currency) result.issues.push("currency: price conflicts with currency");
  if (rawPrice?.includes("€") && currency !== "EUR" || rawPrice?.includes("£") && currency !== "GBP") result.issues.push("currency: symbol conflicts with currency");
  const availability = stock(root, recipe.stock, "availability", result.evidence, result.issues);
  const variants: ExtractedProduct["variants"] = [];
  if (recipe.variants) {
    try {
      const nodes = root.querySelectorAll(recipe.variants.selector);
      if (!nodes.length || nodes.length > 100) result.issues.push("variants: missing or excessive variant elements");
      for (const node of nodes.slice(0, 100)) {
        const label = readField(node, recipe.variants.label, `variant.${variants.length}.label`, result.evidence, result.issues);
        const availability = stock(node, recipe.variants.stock, `variant.${variants.length}.availability`, result.evidence, result.issues);
        if (label) variants.push({ label, availability });
      }
      if (new Set(variants.map((v) => v.label)).size !== variants.length) result.issues.push("variants: duplicate labels");
    } catch { result.issues.push("variants: invalid selector"); }
  }
  if (!result.issues.length && title && priceCents !== null && currency) result.product = { title, priceCents, currency, availability, variants };
  return result;
}
