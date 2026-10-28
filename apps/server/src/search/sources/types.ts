import type { Condition } from "@closet/shared";
import type { SafeFetchOptions } from "@closet/readers";

/** An offer as a source reports it, before we store or group it. */
export type RawOffer = {
  source: string;
  store: { name: string; domain: string };
  url: string;
  title: string;
  brand: string | null;
  priceCents: number;
  currency: string;
  condition: Condition;
  imageUrl: string | null;
  gtin: string | null;
  mpn: string | null;
  inStock: boolean;
};

export type SourceQuery = {
  text: string;
  condition?: Condition;
  maxPriceCents?: number;
  limit: number;
};

export type SourceContext = {
  fetchOptions: SafeFetchOptions;
};

export interface Source {
  id: string;
  label: string;
  search(query: SourceQuery, ctx: SourceContext): Promise<RawOffer[]>;
}
