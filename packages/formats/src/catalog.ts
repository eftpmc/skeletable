import { z } from "zod";
import { listingFields, sourceFields } from "./fields.js";
import { readingImageSchema } from "./reading.js";

/**
 * The catalog file the hub publishes and every app loads: gzipped JSON lines, a header line first,
 * then one line per source and one per listing (sources before their listings). Open data under
 * the Open Database License. Photos are links to the sites' own images, never copies.
 */
export const CATALOG_FORMAT = 2;
export const CATALOG_LICENCE = "ODbL-1.0";

export const catalogHeaderSchema = z.object({
  type: z.literal("header"),
  format: z.literal(CATALOG_FORMAT),
  licence: z.literal(CATALOG_LICENCE),
  buildId: z.string().uuid(),
  builtAt: z.string().datetime({ offset: true }),
  resolverVersion: z.number().int().positive(),
  // Embedding models whose vectors the file carries, with their dimensions.
  embeddings: z.array(z.object({ model: z.string(), kind: z.enum(["photo", "text"]), dimensions: z.number().int().positive() })),
});

const values = <T extends Record<string, { value: z.ZodType }>>(fields: T) =>
  z.object(Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, f.value.optional()])) as { [K in keyof T]: z.ZodOptional<T[K]["value"]> });

export const catalogSourceSchema = z.object({
  type: z.literal("source"),
  id: z.string().uuid(),
  domain: z.string(),
  values: values(sourceFields),
});

export const catalogListingSchema = z.object({
  type: z.literal("listing"),
  id: z.string().uuid(),
  sourceId: z.string().uuid(),
  url: z.string().url(),
  title: z.string(),
  maker: z.string().optional(),
  price: z.object({ amount: z.number().int().nonnegative(), currency: z.string().regex(/^[A-Z]{3}$/) }).optional(),
  available: z.boolean().optional(),
  images: z.array(readingImageSchema).max(10),
  values: values(listingFields),
  // Vectors by model, as base64 of signed bytes scaled so the largest is 127.
  embeddings: z.record(z.string(), z.string()).default({}),
});

export const catalogLineSchema = z.discriminatedUnion("type", [catalogHeaderSchema, catalogSourceSchema, catalogListingSchema]);
export type CatalogHeader = z.infer<typeof catalogHeaderSchema>;
export type CatalogSource = z.infer<typeof catalogSourceSchema>;
export type CatalogListing = z.infer<typeof catalogListingSchema>;
export type CatalogLine = z.infer<typeof catalogLineSchema>;

/** Pack a unit vector into the file's form: signed bytes in base64, scaled so the largest is 127. */
export function packVector(vector: readonly number[]): string {
  const peak = Math.max(...vector.map(Math.abs)) || 1;
  return Buffer.from(Int8Array.from(vector, (x) => Math.round((x / peak) * 127)).buffer).toString("base64");
}

/** Unpack a vector from the file, normalized to unit length. */
export function unpackVector(packed: string): number[] {
  const bytes = Buffer.from(packed, "base64");
  const v = Array.from(new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length));
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
}
