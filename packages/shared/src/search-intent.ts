import { z } from "zod";

const strength = z.enum(["required", "preferred"]);
const evidence = z.string().min(1).max(200);

/** Model proposals and user edits share one bounded, versioned contract. */
export const intentProposalSchema = z.object({
  text: z.string().trim().min(1).max(200),
  condition: z.object({
    values: z.array(z.enum(["new", "used", "refurb"])).min(1).max(3),
    strength,
    evidence,
  }).strict().nullable(),
  budget: z.object({
    amountCents: z.number().int().positive().max(100_000_000),
    currency: z.enum(["USD", "EUR", "GBP", "CAD", "AUD"]),
    comparison: z.enum(["lt", "lte", "around"]),
    strength,
    evidence,
  }).strict().nullable(),
  attributes: z.array(z.object({
    text: z.string().min(1).max(100),
    retrieval: z.string().min(1).max(60).nullable(),
    strength,
    evidence,
  }).strict()).max(6),
  uncertainties: z.array(z.string().min(1).max(160)).max(4),
}).strict();

export const searchIntentSchema = intentProposalSchema.extend({
  version: z.literal(1),
  mode: z.enum(["model", "keyword", "edited"]),
}).refine((intent) => !(intent.budget?.comparison === "around" && intent.budget.strength === "required"), "An approximate budget must be a preference");
export type IntentProposal = z.infer<typeof intentProposalSchema>;
export type SearchIntent = z.infer<typeof searchIntentSchema>;

export function keywordIntent(text: string): SearchIntent {
  return { version: 1, mode: "keyword", text: text.trim(), condition: null, budget: null, attributes: [], uncertainties: [] };
}

export function intentFromParam(value: string | null | undefined): SearchIntent | undefined {
  if (!value || value.length > 6000) return undefined;
  try { return searchIntentSchema.parse(JSON.parse(value)); } catch { return undefined; }
}

export function budgetLabel(budget: NonNullable<SearchIntent["budget"]>): string {
  const amount = new Intl.NumberFormat("en-US", { style: "currency", currency: budget.currency }).format(budget.amountCents / 100);
  return `${budget.comparison === "lt" ? "Under" : budget.comparison === "around" ? "Around" : "Up to"} ${amount} ${budget.currency}`;
}

/** Saved-search identity does not depend on evidence or origin. */
export function intentKey(intent: SearchIntent | null | undefined): string {
  if (!intent) return "";
  return JSON.stringify({
    text: intent.text.toLowerCase(),
    condition: intent.condition && { values: [...new Set(intent.condition.values)].sort(), strength: intent.condition.strength },
    budget: intent.budget && { amountCents: intent.budget.amountCents, currency: intent.budget.currency, comparison: intent.budget.comparison, strength: intent.budget.strength },
    attributes: intent.attributes.map(({ text, retrieval, strength }) => ({ text, retrieval, strength })),
    uncertainties: intent.uncertainties,
  });
}
