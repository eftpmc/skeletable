import { z } from "zod";
import type { SearchIntent } from "./search-intent.js";

export const conditions = ["new", "refurb", "used"] as const;
export const conditionSchema = z.enum(conditions);
export type Condition = z.infer<typeof conditionSchema>;

export const conditionLabels: Record<Condition, string> = {
  new: "New",
  refurb: "Refurb",
  used: "Used",
};

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  condition: conditionSchema.optional(),
  max: z.coerce.number().int().positive().max(1_000_000).optional(),
  intent: z.string().max(6000).optional(),
  mode: z.enum(["auto", "assisted", "keyword"]).optional(),
});
export type SearchQueryInput = z.input<typeof searchQuerySchema>;

export type OfferSummary = {
  id: string;
  title: string;
  brand: string | null;
  priceCents: number;
  currency: string;
  condition: Condition;
  store: { name: string; domain: string };
  url: string;
  imageUrl: string | null;
  source: string;
};

export type VerdictLabel = "good" | "typical" | "high" | "unknown";
export type Verdict = { label: VerdictLabel; text: string };

export type ResultCard = {
  productId: string;
  title: string;
  brand: string | null;
  imageUrl: string | null;
  best: OfferSummary;
  offerCount: number;
  storeCount: number;
  verdict: Verdict;
};

export type SourceStatus = {
  id: string;
  label: string;
  status: "ok" | "error" | "timeout";
  count: number;
  ms: number;
};

export type SearchResponse = {
  query: string;
  intent: SearchIntent;
  total: number;
  storeCount: number;
  sources: SourceStatus[];
  results: ResultCard[];
};

export type ConditionSummary = {
  condition: Condition;
  best: OfferSummary | null;
  count: number;
  verdict: Verdict;
};

export type ProductDetail = {
  id: string;
  title: string;
  brand: string | null;
  imageUrl: string | null;
  gtin: string | null;
  mpn: string | null;
  conditions: ConditionSummary[];
  offers: OfferSummary[];
};

export type SourceInfo = { id: string; label: string; enabled: boolean; needs: string | null };
