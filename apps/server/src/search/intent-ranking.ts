import type { SearchIntent } from "@skeleton/shared";
import type { RawOffer } from "./sources/types.js";
import { relevance } from "./normalize.js";

export function satisfiesIntent(offer: RawOffer, intent: SearchIntent): boolean {
  if (!offer.inStock) return false;
  if (intent.condition?.strength === "required" && !intent.condition.values.includes(offer.condition)) return false;
  const budget = intent.budget;
  if (budget?.strength === "required") {
    if (offer.currency !== budget.currency) return false;
    if (budget.comparison === "lt" ? offer.priceCents >= budget.amountCents : offer.priceCents > budget.amountCents) return false;
  }
  return true;
}

/** Preferences break relevance ties, never exclude an otherwise eligible offer. */
export function preferenceScore(offer: RawOffer, intent: SearchIntent): number {
  let score = 0;
  if (intent.condition?.strength === "preferred" && intent.condition.values.includes(offer.condition)) score += 1;
  const budget = intent.budget;
  if (budget?.strength === "preferred" && offer.currency === budget.currency) {
    const distance = budget.comparison === "around" ? Math.abs(offer.priceCents - budget.amountCents) : Math.max(0, offer.priceCents - budget.amountCents);
    score += 1 / (1 + distance / budget.amountCents);
  }
  for (const attribute of intent.attributes) {
    if (attribute.retrieval) score += 0.1 * relevance(attribute.retrieval, offer.title, offer.brand);
  }
  return score;
}

export function retrievalQueries(intent: SearchIntent): string[] {
  const cues = intent.attributes.map((a) => a.retrieval).filter(Boolean).join(" ");
  return cues ? [intent.text, `${intent.text} ${cues}`.slice(0, 300)] : [intent.text];
}
