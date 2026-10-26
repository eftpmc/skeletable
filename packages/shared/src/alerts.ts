import { z } from "zod";
import { type Condition, conditionSchema } from "./search.js";

export const watchInputSchema = z.object({
  productId: z.uuid(),
  condition: conditionSchema.optional(),
});
export type WatchInput = z.input<typeof watchInputSchema>;

/** A tracked product with its best price now and when tracking started. */
export type WatchSummary = {
  productId: string;
  title: string;
  brand: string | null;
  imageUrl: string | null;
  condition: Condition | null;
  savedPriceCents: number | null;
  currentPriceCents: number | null;
  currency: string | null;
  /** How much cheaper it is now than when tracking started; 0 if not. */
  dropCents: number;
  storeCount: number;
  createdAt: string;
};

export const savedSearchInputSchema = z.object({
  q: z.string().trim().min(1).max(200),
  condition: conditionSchema.optional(),
  max: z.number().int().positive().max(1_000_000).optional(),
});
export type SavedSearchInput = z.input<typeof savedSearchInputSchema>;

export type SavedSearchSummary = {
  id: string;
  query: string;
  condition: Condition | null;
  max: number | null;
  /** Products found since they last looked. */
  newCount: number;
  /** Photos of the newest matches, up to four. */
  images: string[];
  createdAt: string;
  lastRunAt: string | null;
};

export type AlertEvent =
  | {
      id: string;
      kind: "new_matches";
      createdAt: string;
      read: boolean;
      count: number;
      search: { id: string; query: string; condition: Condition | null; max: number | null };
      images: string[];
    }
  | {
      id: string;
      kind: "price_drop";
      createdAt: string;
      read: boolean;
      product: { id: string; title: string; brand: string | null; imageUrl: string | null };
      fromPriceCents: number;
      toPriceCents: number;
      currency: string;
    };

export type AlertsResponse = { unread: number; events: AlertEvent[] };
