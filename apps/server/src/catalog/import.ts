import { type Db, schema } from "@closet/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { slugify } from "../closet/service.js";

const { brand, brandPhoto, brandProfile, PHOTO_DIMENSIONS } = schema;

/** One line of the lab's export (lab/brands/export.py). */
export const catalogRecordSchema = z.object({
  kind: z.enum(["store", "name"]),
  name: z.string().min(1).max(200),
  site: z.string().url().nullable(),
  platform: z.string().max(40).nullable(),
  country: z.string().max(80).nullable(),
  city: z.string().max(120).nullable(),
  description: z.string().max(1000).nullable(),
  priceLowUsd: z.number().int().nonnegative().nullable(),
  priceHighUsd: z.number().int().nonnegative().nullable(),
  quality: z.number().min(0).max(1),
  seenAt: z.number().int().nonnegative().nullable(),
  look: z.array(z.number()).length(PHOTO_DIMENSIONS),
  photos: z
    .array(
      z.object({
        imageUrl: z.string().url(),
        title: z.string().max(300).nullable(),
        priceUsd: z.number().nonnegative().nullable(),
        productUrl: z.string().url().nullable(),
      }),
    )
    .max(12),
});
export type CatalogRecord = z.infer<typeof catalogRecordSchema>;

const domainOf = (site: string | null) => (site ? new URL(site).hostname.replace(/^www\./, "") : null);

/**
 * Add or refresh catalog brands. A brand is matched by its site first, then by name:
 * - a store brand takes over a brand people already added by name (their Collection items now
 *   link to its catalog page); two different stores with one name get the site in the slug;
 * - a "name" brand attaches to a brand with that name unless a store already covers it.
 * Brands missing from an import are left as they are.
 */
export async function importCatalog(db: Db, records: CatalogRecord[]) {
  const counts = { added: 0, updated: 0, skipped: 0 };
  for (const r of records) {
    const domain = domainOf(r.site);
    const slug = slugify(r.name);
    await db.transaction(async (tx) => {
      let [target] = domain
        ? await tx.select({ id: brand.id }).from(brand).where(eq(brand.domain, domain))
        : [];
      if (!target) {
        const [byName] = await tx
          .select({ id: brand.id, domain: brand.domain, kind: brandProfile.kind })
          .from(brand)
          .leftJoin(brandProfile, eq(brandProfile.brandId, brand.id))
          .where(eq(brand.slug, slug));
        if (byName && r.kind === "name" && byName.kind === "store") {
          counts.skipped++;
          return;
        }
        // Same name, different store: keep both, telling them apart by site.
        const taken = byName && byName.kind === "store" && byName.domain !== domain;
        if (byName && !taken) target = byName;
        else {
          const [row] = await tx
            .insert(brand)
            .values({ name: r.name, slug: taken ? `${slug} (${domain})` : slug, domain })
            .onConflictDoUpdate({ target: brand.slug, set: { domain } })
            .returning({ id: brand.id });
          target = row!;
        }
      }
      const id = target!.id;
      if (domain) await tx.update(brand).set({ domain }).where(and(eq(brand.id, id), isNull(brand.domain)));
      const profile = {
        kind: r.kind,
        site: r.site,
        platform: r.platform,
        country: r.country,
        city: r.city,
        description: r.description,
        priceLowUsd: r.priceLowUsd,
        priceHighUsd: r.priceHighUsd,
        quality: r.quality,
        seenAt: r.seenAt,
        look: r.look,
      };
      const existing = await tx.select({ id: brandProfile.brandId }).from(brandProfile).where(eq(brandProfile.brandId, id));
      await tx
        .insert(brandProfile)
        .values({ brandId: id, ...profile })
        .onConflictDoUpdate({ target: brandProfile.brandId, set: { ...profile, updatedAt: sql`now()` } });
      if (existing.length) counts.updated++;
      else counts.added++;
      await tx.delete(brandPhoto).where(eq(brandPhoto.brandId, id));
      if (r.photos.length) await tx.insert(brandPhoto).values(r.photos.map((p, position) => ({ brandId: id, position, ...p })));
    });
  }
  return counts;
}
