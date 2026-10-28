import { catalogCategorySchema, departments } from "@closet/shared";
import { z } from "zod";

/**
 * The fields annotations can set, each with its value's format and version. An annotation names
 * the field and version it follows; when a field's format changes, its version goes up and older
 * annotations stay valid for the version they used. New fields are new jobs over readings we have.
 */
export const areas = ["clothing", "home", "tech"] as const;
export const areaSchema = z.enum(areas);
export type Area = z.infer<typeof areaSchema>;

const word = z.string().trim().toLowerCase().min(1).max(60);
const score = z.number().min(0).max(1);

export const listingFields = {
  area: { version: 1, value: areaSchema },
  category: { version: 1, value: catalogCategorySchema },
  department: { version: 1, value: z.enum(departments) },
  materials: { version: 1, value: z.array(word).max(10) },
  colours: { version: 1, value: z.array(word).max(10) },
  condition: { version: 1, value: z.enum(["new", "used", "vintage", "refurbished"]) },
  // Where it was made, as an ISO 3166 alpha-2 country code.
  origin: { version: 1, value: z.string().regex(/^[A-Z]{2}$/) },
  styles: { version: 1, value: z.array(word).max(10) },
  // Is it worth what it costs, for what it is: 0 poor to 1 excellent.
  value: { version: 1, value: score },
  // How well made it is, from materials and construction: 0 poor to 1 excellent.
  quality: { version: 1, value: score },
} as const;

export const sourceFields = {
  // What kind of seller the site is.
  sellerKind: { version: 1, value: z.enum(["maker", "retailer", "reseller", "dropshipper", "marketplace"]) },
  areas: { version: 1, value: z.array(areaSchema).min(1) },
  quality: { version: 1, value: score },
  // Where it ships from, as an ISO 3166 alpha-2 country code.
  shipsFrom: { version: 1, value: z.string().regex(/^[A-Z]{2}$/) },
  summary: { version: 1, value: z.string().trim().min(1).max(500) },
} as const;

export type ListingField = keyof typeof listingFields;
export type SourceField = keyof typeof sourceFields;

/** Check a value against its field's format; throws on an unknown field or a bad value. */
export function parseFieldValue(subject: "listing" | "source", field: string, value: unknown): unknown {
  const fields: Record<string, { value: z.ZodType }> = subject === "listing" ? listingFields : sourceFields;
  const spec = fields[field];
  if (!spec) throw new Error(`unknown ${subject} field: ${field}`);
  return spec.value.parse(value);
}

export const fieldVersion = (subject: "listing" | "source", field: string): number => {
  const fields: Record<string, { version: number }> = subject === "listing" ? listingFields : sourceFields;
  const spec = fields[field];
  if (!spec) throw new Error(`unknown ${subject} field: ${field}`);
  return spec.version;
};
