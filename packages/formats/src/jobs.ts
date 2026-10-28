import { z } from "zod";
import { areaSchema, listingFields, sourceFields } from "./fields.js";
import { readingSchema } from "./reading.js";

/**
 * The kinds of work in the hub's queue. Each kind has a version, a level (1 facts from text,
 * 2 photos, 3 judgement, 4 investigation), the subject it's about, and fixed input and answer
 * formats. Workers and agents only ever see these formats, so any of them can take any job they
 * are able to do, and every answer can be checked before it becomes annotations.
 */

const confidence = z.number().min(0).max(1);
const reason = z.string().trim().min(1).max(500);

/** Level 1: pull plain facts from a listing's text. A small local model's job. */
export const extractFacts = {
  kind: "extract-facts",
  version: 1,
  level: 1,
  subject: "listing",
  input: readingSchema.pick({ title: true, description: true, maker: true, productType: true, tags: true }),
  answer: z.object({
    area: listingFields.area.value.nullable(),
    category: listingFields.category.value.nullable(),
    department: listingFields.department.value.nullable(),
    materials: listingFields.materials.value,
    colours: listingFields.colours.value,
    condition: listingFields.condition.value.nullable(),
    origin: listingFields.origin.value.nullable(),
    confidence,
  }),
} as const;

/** Level 3: judge a listing's quality and value for money, with reasons. */
export const judgeListing = {
  kind: "judge-listing",
  version: 1,
  level: 3,
  subject: "listing",
  input: readingSchema.pick({ title: true, description: true, maker: true, price: true, images: true, url: true }),
  answer: z.object({
    quality: listingFields.quality.value,
    value: listingFields.value.value,
    styles: listingFields.styles.value,
    reason,
    confidence,
  }),
} as const;

/** Level 4: investigate a site from the hub's summary of it (the agent never crawls it). */
export const judgeSource = {
  kind: "judge-source",
  version: 1,
  level: 4,
  subject: "source",
  input: z.object({
    domain: z.string(),
    summary: z.object({
      listings: z.number().int().nonnegative(),
      priceRange: z.tuple([z.number(), z.number()]).nullable(),
      currency: z.string().nullable(),
      sampleTitles: z.array(z.string()).max(30),
      makers: z.array(z.string()).max(30),
      about: z.string().max(4000).nullable(),
      warnings: z.array(z.string()).max(20),
    }),
  }),
  answer: z.object({
    sellerKind: sourceFields.sellerKind.value,
    areas: z.array(areaSchema).min(1),
    quality: sourceFields.quality.value,
    shipsFrom: sourceFields.shipsFrom.value.nullable(),
    summary: sourceFields.summary.value,
    approve: z.boolean(),
    reason,
    confidence,
  }),
} as const;

export const jobKinds = { [extractFacts.kind]: extractFacts, [judgeListing.kind]: judgeListing, [judgeSource.kind]: judgeSource };
export type JobKind = keyof typeof jobKinds;

/** Check an answer against its job kind's format; throws when it doesn't fit, naming what's wrong. */
export function parseAnswer(kind: string, version: number, answer: unknown) {
  const spec = jobKinds[kind as JobKind];
  if (!spec) throw new Error(`unknown job kind: ${kind}`);
  if (spec.version !== version) throw new Error(`${kind} is at version ${spec.version}, not ${version}`);
  return spec.answer.parse(answer);
}
