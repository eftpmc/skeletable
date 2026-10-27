import { z } from "zod";

export const brandVerdictSchema = z.enum(["like", "skip", "flag"]);
/** "like": a find. "skip": not for me (taste only). "flag": not a real brand (quality only). */
export type BrandVerdict = z.infer<typeof brandVerdictSchema>;

export const voteInputSchema = z.object({
  verdict: brandVerdictSchema.nullable(),
  context: z.string().max(200).optional(),
});
export type VoteInput = z.input<typeof voteInputSchema>;

/** Brands someone needs to have shown interest in (hearted or looked at properly) before "For you" has a taste to rank by. */
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
  /** Brands someone has shown interest in so far: hearted, or looked at properly. */
  interested: number;
  needed: number;
  brands: BrandMatch[];
};

export const seenInputSchema = z.object({ dwellMs: z.number().int().min(0).max(86_400_000) });

/** One product from the catalog: a photo from a brand's store, with its title, price and page. Ids are "<brandId>.<position>". */
export type CatalogItem = {
  id: string;
  brandId: string;
  brandName: string;
  imageUrl: string;
  title: string | null;
  priceUsd: number | null;
  productUrl: string | null;
};

/** A page of Discover's feed. `next` is the page to ask for after this one, null at the end. */
export type ItemFeed = { items: CatalogItem[]; next: number | null };

/** One item opened: the brand it's from, more from that brand, more like it, and whether you've saved it. */
export type ItemDetail = {
  item: CatalogItem;
  brand: BrandCard;
  moreFromBrand: CatalogItem[];
  moreLikeThis: CatalogItem[];
  /** The tracked product this item became when you saved it, if you have. */
  savedProductId: string | null;
};
