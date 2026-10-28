import { z } from "zod";

/**
 * What a site showed for one listing, as a reader saw it: the raw layer. Readers fill in what the
 * site states and leave the rest out; nothing here is inferred, and AI never writes it. Prices are
 * in minor units (cents) of the stated currency, so nothing is lost to rounding or conversion.
 */
export const READING_FORMAT = 1;

const url = z.string().url().max(2000);
const text = (max: number) => z.string().trim().min(1).max(max);
const money = z.object({
  amount: z.number().int().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/),
});

export const readingImageSchema = z.object({
  url,
  width: z.number().int().positive().max(20_000).optional(),
  height: z.number().int().positive().max(20_000).optional(),
  alt: text(500).optional(),
});

export const readingVariantSchema = z.object({
  externalId: text(200).optional(),
  title: text(300),
  // The site's own option names and values, such as { Size: "M", Colour: "Navy" }.
  options: z.record(text(100), text(200)).optional(),
  price: money.optional(),
  available: z.boolean().optional(),
  sku: text(200).optional(),
});

export const readingSchema = z.object({
  // The site's stable id for the listing: its own id, else its handle, else its URL.
  externalId: text(300),
  url,
  title: text(500),
  description: text(20_000).optional(),
  // Who made it, as the site names it (Shopify's "vendor", schema.org's "brand").
  maker: text(200).optional(),
  // The site's own classification, kept verbatim for annotators to read.
  productType: text(200).optional(),
  tags: z.array(text(200)).max(200).default([]),
  price: money.optional(),
  // A crossed-out "was" price, when the site shows one.
  compareAt: money.optional(),
  available: z.boolean().optional(),
  images: z.array(readingImageSchema).max(50).default([]),
  variants: z.array(readingVariantSchema).max(500).default([]),
  // When the site says it published or last changed the listing.
  publishedAt: z.string().datetime({ offset: true }).optional(),
  updatedAt: z.string().datetime({ offset: true }).optional(),
});
export type Reading = z.infer<typeof readingSchema>;
export type ReadingInput = z.input<typeof readingSchema>;
