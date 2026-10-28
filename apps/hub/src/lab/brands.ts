import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { fieldVersion, parseFieldValue } from "@skeleton/formats";
import { type HubDb, schema } from "@skeleton/hub-db";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { contributorId } from "../contributors.js";
import { domainOf } from "../sources.js";

const { source, sourceAnnotation } = schema;

const LAB = { handle: "lab", kind: "system" } as const;
// Names the lab's brand work in each annotation, so it can be told apart and redone.
export const LAB_BRANDS_VERSION = "lab-brands-1";

/** The parts of the lab's old catalog pack (lab/brands/export.py) that describe a store. */
const brandSchema = z.object({
  kind: z.string(),
  name: z.string(),
  site: z.string().nullable(),
  country: z.string().nullable(),
  city: z.string().nullable(),
  description: z.string().nullable(),
  quality: z.number(),
});

/**
 * Carry over what the lab knew about each store it vetted, as annotations on the matching source:
 * its name, where it's based and a description (the lab read these from the store), and its
 * quality score (the lab's ranking model, so annotated as a model's). Stores the hub doesn't have
 * are skipped. Running it again adds nothing.
 */
export async function importLabBrands(db: HubDb, packFile: string): Promise<{ matched: number; unmatched: number; annotations: number }> {
  const lab = await contributorId(db, LAB.handle, LAB.kind);
  const brands = gunzipSync(await readFile(packFile))
    .toString("utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      const parsed = brandSchema.safeParse(JSON.parse(line));
      return parsed.success && parsed.data.kind === "store" && parsed.data.site ? [parsed.data] : [];
    });
  const domains = await db
    .select({ id: source.id, domain: source.domain })
    .from(source)
    .where(inArray(source.domain, brands.map((b) => domainOf(b.site!))));
  const byDomain = new Map(domains.map((d) => [d.domain, d.id]));
  const done = new Set(
    (
      await db
        .selectDistinct({ sourceId: sourceAnnotation.sourceId })
        .from(sourceAnnotation)
        .where(and(eq(sourceAnnotation.promptVersion, LAB_BRANDS_VERSION), eq(sourceAnnotation.contributorId, lab)))
    ).map((r) => r.sourceId),
  );

  let matched = 0;
  const rows: (typeof sourceAnnotation.$inferInsert)[] = [];
  for (const b of brands) {
    const sourceId = byDomain.get(domainOf(b.site!));
    if (!sourceId) continue;
    matched++;
    if (done.has(sourceId)) continue;
    const add = (field: string, value: unknown, method: "rule" | "model", confidence: number) => {
      try {
        rows.push({
          sourceId,
          field,
          fieldVersion: fieldVersion("source", field),
          value: parseFieldValue("source", field, value),
          confidence,
          method,
          promptVersion: LAB_BRANDS_VERSION,
          contributorId: lab,
          reason: "from the brand lab",
        });
      } catch {
        // A value the field's format won't take (a country written out in words, say) is left out.
      }
    };
    add("name", b.name, "rule", 0.8);
    if (b.country) add("country", b.country, "rule", 0.6);
    if (b.city) add("city", b.city, "rule", 0.6);
    if (b.description) add("summary", b.description, "rule", 0.6);
    add("quality", b.quality, "model", 0.6);
  }
  for (let i = 0; i < rows.length; i += 1000) await db.insert(sourceAnnotation).values(rows.slice(i, i + 1000));
  return { matched, unmatched: brands.length - matched, annotations: rows.length };
}
