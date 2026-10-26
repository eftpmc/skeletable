import { z } from "zod";

export const brandVerdictSchema = z.enum(["like", "skip", "flag"]);
/** "like": a find. "skip": not for me (taste only). "flag": not a real brand (quality only). */
export type BrandVerdict = z.infer<typeof brandVerdictSchema>;

export const voteInputSchema = z.object({
  verdict: brandVerdictSchema.nullable(),
  context: z.string().max(200).optional(),
});
export type VoteInput = z.input<typeof voteInputSchema>;

/** Likes needed before "For you" has a taste to rank by. */
export const TASTE_UNLOCK = 5;

/** A brand as cards show it. */
export type BrandCard = {
  id: string;
  name: string;
  /** "store": found by reading its store. "name": known from other stores' listings, a starting point only. */
  kind: "store" | "name";
  site: string | null;
  /** "shopify", "woocommerce", "other"…; null for "name" brands. */
  platform: string | null;
  /** "City, CC" or "CC", when known. */
  where: string | null;
  priceLowUsd: number | null;
  priceHighUsd: number | null;
  /** How many stores list it ("name" brands). */
  seenAt: number | null;
  /** Up to four product photo URLs. */
  photos: string[];
  myVote: BrandVerdict | null;
  likes: number;
};

export type BrandPhoto = { imageUrl: string; title: string | null; priceUsd: number | null; productUrl: string | null };

/** A neighbor or a "For you" pick, with why it's here. */
export type BrandMatch = BrandCard & {
  /** 0 to 1, for a match bar. */
  match: number;
  /** A brand nobody has voted on yet, shown so new brands get a chance. */
  explore?: boolean;
  /** The liked brand this one is closest to ("For you"). */
  because?: { id: string; name: string } | null;
};

export type BrandDetail = BrandCard & {
  description: string | null;
  photoDetails: BrandPhoto[];
  neighbors: BrandMatch[];
  /** True when the neighbors are re-ordered by the viewer's taste. */
  personal: boolean;
};

export type ForYou = {
  likes: number;
  needed: number;
  brands: BrandMatch[];
};
