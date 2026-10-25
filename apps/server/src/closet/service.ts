import { type Db, schema } from "@closet/db";
import type { BrandFit, Category, ColorName, Item, ItemPatch, MediaRef, ParsedItemInput } from "@closet/shared";
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import type { Storage } from "../storage.js";
import { processImage } from "./images.js";

const { brand, brandFit, item, media, wearLog } = schema;

export class NotFoundError extends Error {}

export const mediaKey = (id: string, variant: "full" | "thumb") => `media/${id}/${variant}.webp`;

export function slugify(name: string) {
  return name.toLowerCase().normalize("NFKD").replace(/\s+/g, " ").trim();
}

/** Find a brand by name, creating it on first use. */
export async function upsertBrand(db: Db, name: string): Promise<string> {
  const slug = slugify(name);
  await db.insert(brand).values({ name: name.trim(), slug }).onConflictDoNothing({ target: brand.slug });
  const [row] = await db.select({ id: brand.id }).from(brand).where(eq(brand.slug, slug));
  return row!.id;
}

/** Store an image for a user. The media row stays unattached until an item claims it. */
export async function saveMedia(db: Db, storage: Storage, userId: string, data: Buffer) {
  const processed = await processImage(data);
  const [row] = await db
    .insert(media)
    .values({ userId, width: processed.width, height: processed.height, colors: processed.colors })
    .returning();
  await Promise.all([
    storage.put(mediaKey(row!.id, "full"), processed.full),
    storage.put(mediaKey(row!.id, "thumb"), processed.thumb),
  ]);
  return { ...toMediaRef(row!), colors: processed.colors as ColorName[] };
}

export function toMediaRef(row: { id: string; width: number; height: number }): MediaRef {
  return {
    id: row.id,
    url: `/api/media/${row.id}/full`,
    thumbUrl: `/api/media/${row.id}/thumb`,
    width: row.width,
    height: row.height,
  };
}

export type ItemFilters = { category?: Category; color?: ColorName; q?: string };

export async function listItems(db: Db, userId: string, filters: ItemFilters = {}): Promise<Item[]> {
  const conditions = [eq(item.userId, userId)];
  if (filters.category) conditions.push(eq(item.category, filters.category));
  if (filters.color) conditions.push(sql`${item.colors} @> ARRAY[${filters.color}]::text[]`);
  if (filters.q?.trim()) {
    const pattern = `%${filters.q.trim().replace(/[%_\\]/g, "\\$&")}%`;
    conditions.push(or(ilike(item.title, pattern), ilike(brand.name, pattern))!);
  }

  const rows = await db
    .select({ item, brandName: brand.name })
    .from(item)
    .leftJoin(brand, eq(item.brandId, brand.id))
    .where(and(...conditions))
    .orderBy(desc(item.createdAt));

  return hydrate(db, rows);
}

export async function getItem(db: Db, userId: string, id: string): Promise<Item> {
  const rows = await db
    .select({ item, brandName: brand.name })
    .from(item)
    .leftJoin(brand, eq(item.brandId, brand.id))
    .where(and(eq(item.userId, userId), eq(item.id, id)));
  if (rows.length === 0) throw new NotFoundError();
  return (await hydrate(db, rows))[0]!;
}

export async function createItem(
  db: Db,
  storage: Storage,
  userId: string,
  input: ParsedItemInput,
  downloadImage: (url: string) => Promise<Buffer>,
): Promise<Item> {
  // Download remote images first so a failure doesn't leave a half-made item.
  const downloaded: { id: string; colors: ColorName[] }[] = [];
  for (const url of input.imageUrls) {
    try {
      const saved = await saveMedia(db, storage, userId, await downloadImage(url));
      downloaded.push(saved);
    } catch {
      // A broken product image shouldn't block saving the item.
    }
  }

  const uploaded = await ownedUnattachedMedia(db, userId, input.mediaIds);
  const mediaIds = [...input.mediaIds.filter((id) => uploaded.has(id)), ...downloaded.map((entry) => entry.id)];
  const firstColors = (input.mediaIds[0] && uploaded.get(input.mediaIds[0])) || downloaded[0]?.colors || [];

  const brandId = input.brand ? await upsertBrand(db, input.brand) : null;
  const [row] = await db
    .insert(item)
    .values({
      userId,
      brandId,
      title: input.title,
      category: input.category,
      colors: input.colors.length > 0 ? input.colors : firstColors,
      size: input.size ?? null,
      material: input.material ?? null,
      notes: input.notes ?? null,
      priceCents: input.priceCents ?? null,
      currency: input.currency ?? null,
      purchasedOn: input.purchasedOn ?? null,
      sourceUrl: input.sourceUrl ?? null,
      source: input.source,
    })
    .returning({ id: item.id });

  await attachMedia(db, row!.id, mediaIds);
  return getItem(db, userId, row!.id);
}

export async function updateItem(db: Db, storage: Storage, userId: string, id: string, patch: ItemPatch) {
  const existing = await getItem(db, userId, id);
  const values: Partial<typeof item.$inferInsert> = {};
  if (patch.title !== undefined) values.title = patch.title;
  if (patch.category !== undefined) values.category = patch.category;
  if (patch.colors !== undefined) values.colors = patch.colors;
  if (patch.size !== undefined) values.size = patch.size;
  if (patch.material !== undefined) values.material = patch.material;
  if (patch.notes !== undefined) values.notes = patch.notes;
  if (patch.priceCents !== undefined) values.priceCents = patch.priceCents;
  if (patch.currency !== undefined) values.currency = patch.currency;
  if (patch.purchasedOn !== undefined) values.purchasedOn = patch.purchasedOn;
  if (patch.sourceUrl !== undefined) values.sourceUrl = patch.sourceUrl;
  if (patch.brand !== undefined) values.brandId = patch.brand ? await upsertBrand(db, patch.brand) : null;

  if (Object.keys(values).length > 0) {
    await db.update(item).set(values).where(and(eq(item.id, id), eq(item.userId, userId)));
  }

  if (patch.mediaIds) {
    const current = new Set(existing.media.map((entry) => entry.id));
    const unattached = await ownedUnattachedMedia(db, userId, patch.mediaIds.filter((mid) => !current.has(mid)));
    const keep = patch.mediaIds.filter((mid) => current.has(mid) || unattached.has(mid));
    const removed = [...current].filter((mid) => !keep.includes(mid));
    if (removed.length > 0) await deleteMedia(db, storage, removed);
    await attachMedia(db, id, keep);
  }

  return getItem(db, userId, id);
}

export async function deleteItem(db: Db, storage: Storage, userId: string, id: string) {
  const existing = await getItem(db, userId, id);
  await db.delete(item).where(and(eq(item.id, id), eq(item.userId, userId)));
  await Promise.all(existing.media.map((entry) => storage.remove(`media/${entry.id}`)));
}

export async function logWear(db: Db, userId: string, itemId: string, wornOn: string) {
  await getItem(db, userId, itemId);
  await db.insert(wearLog).values({ userId, itemId, wornOn }).onConflictDoNothing();
  return getItem(db, userId, itemId);
}

export async function unlogWear(db: Db, userId: string, itemId: string, wornOn: string) {
  await getItem(db, userId, itemId);
  await db
    .delete(wearLog)
    .where(and(eq(wearLog.userId, userId), eq(wearLog.itemId, itemId), eq(wearLog.wornOn, wornOn)));
  return getItem(db, userId, itemId);
}

export async function listWears(db: Db, userId: string, itemId: string) {
  await getItem(db, userId, itemId);
  const rows = await db
    .select({ wornOn: wearLog.wornOn })
    .from(wearLog)
    .where(and(eq(wearLog.userId, userId), eq(wearLog.itemId, itemId)))
    .orderBy(desc(wearLog.wornOn));
  return rows.map((row) => row.wornOn);
}

export async function listUserBrands(db: Db, userId: string): Promise<string[]> {
  const rows = await db.execute<{ name: string }>(sql`
    select distinct b.name from ${brand} b
    where b.id in (select brand_id from ${item} where user_id = ${userId} and brand_id is not null)
       or b.id in (select brand_id from ${brandFit} where user_id = ${userId})
    order by b.name`);
  return rows.map((row) => row.name);
}

export async function listBrandFits(db: Db, userId: string): Promise<BrandFit[]> {
  const rows = await db
    .select({ brand: brand.name, size: brandFit.size, note: brandFit.note })
    .from(brandFit)
    .innerJoin(brand, eq(brandFit.brandId, brand.id))
    .where(eq(brandFit.userId, userId))
    .orderBy(asc(brand.name));
  return rows;
}

export async function upsertBrandFit(db: Db, userId: string, fit: { brand: string; size?: string | null; note?: string | null }) {
  const brandId = await upsertBrand(db, fit.brand);
  await db
    .insert(brandFit)
    .values({ userId, brandId, size: fit.size ?? null, note: fit.note ?? null })
    .onConflictDoUpdate({
      target: [brandFit.userId, brandFit.brandId],
      set: { size: fit.size ?? null, note: fit.note ?? null, updatedAt: new Date() },
    });
  return listBrandFits(db, userId);
}

export async function deleteBrandFit(db: Db, userId: string, brandName: string) {
  const [row] = await db.select({ id: brand.id }).from(brand).where(eq(brand.slug, slugify(brandName)));
  if (row) await db.delete(brandFit).where(and(eq(brandFit.userId, userId), eq(brandFit.brandId, row.id)));
  return listBrandFits(db, userId);
}

/** Returns the media the user owns and hasn't attached to an item, with their detected colors. */
async function ownedUnattachedMedia(db: Db, userId: string, ids: string[]) {
  if (ids.length === 0) return new Map<string, ColorName[]>();
  const rows = await db
    .select({ id: media.id, colors: media.colors })
    .from(media)
    .where(and(eq(media.userId, userId), inArray(media.id, ids), isNull(media.itemId)));
  return new Map(rows.map((row) => [row.id, row.colors as ColorName[]]));
}

async function attachMedia(db: Db, itemId: string, ids: string[]) {
  await Promise.all(
    ids.map((id, position) => db.update(media).set({ itemId, position }).where(eq(media.id, id))),
  );
}

async function deleteMedia(db: Db, storage: Storage, ids: string[]) {
  await db.delete(media).where(inArray(media.id, ids));
  await Promise.all(ids.map((id) => storage.remove(`media/${id}`)));
}

type ItemRow = { item: typeof item.$inferSelect; brandName: string | null };

async function hydrate(db: Db, rows: ItemRow[]): Promise<Item[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.item.id);

  const [mediaRows, wearRows] = await Promise.all([
    db.select().from(media).where(inArray(media.itemId, ids)).orderBy(asc(media.position)),
    db
      .select({
        itemId: wearLog.itemId,
        count: sql<number>`count(*)::int`,
        lastWornOn: sql<string>`max(${wearLog.wornOn})::text`,
      })
      .from(wearLog)
      .where(inArray(wearLog.itemId, ids))
      .groupBy(wearLog.itemId),
  ]);

  const mediaByItem = new Map<string, MediaRef[]>();
  for (const row of mediaRows) {
    const list = mediaByItem.get(row.itemId!) ?? [];
    list.push(toMediaRef(row));
    mediaByItem.set(row.itemId!, list);
  }
  const wearByItem = new Map(wearRows.map((row) => [row.itemId, row]));

  return rows.map(({ item: row, brandName }) => {
    const wear = wearByItem.get(row.id);
    const count = wear?.count ?? 0;
    return {
      id: row.id,
      title: row.title,
      brand: brandName,
      category: row.category as Category,
      colors: row.colors as ColorName[],
      size: row.size,
      material: row.material,
      notes: row.notes,
      priceCents: row.priceCents,
      currency: row.currency,
      purchasedOn: row.purchasedOn,
      sourceUrl: row.sourceUrl,
      source: row.source as Item["source"],
      media: mediaByItem.get(row.id) ?? [],
      wear: {
        count,
        lastWornOn: wear?.lastWornOn ?? null,
        costPerWearCents: row.priceCents !== null && count > 0 ? Math.round(row.priceCents / count) : null,
      },
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}
