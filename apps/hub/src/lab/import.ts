import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { type HubDb, schema } from "@skeleton/hub-db";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { contributorId } from "../contributors.js";
import { storeReadings } from "../engine/store.js";
import { shopifyProductSchema, shopifyReading } from "../readers/shopify.js";
import { domainOf } from "../sources.js";
import { npyRow, npyStrings, readNpz } from "./npz.js";

const { embedding, listing, source } = schema;

// The model the lab's vectors came from (lab/brands/build_items.py).
export const LAB_PHOTO_MODEL = "clip-vit-b-32";
const LAB = { handle: "lab", kind: "system" } as const;

const storeFileSchema = z.object({
  status: z.string(),
  host: z.string().optional(),
  products: z.array(z.unknown()).optional(),
});

/** The lab's photo key: the first 20 hex digits of the SHA-1 of the photo's URL (lab/brands/items.py key_of). */
const photoKey = (url: string) => createHash("sha1").update(url).digest("hex").slice(0, 20);

export type LabImport = { stores: number; skipped: number; listings: number; added: number; vectors: number };

/**
 * Bring in what the brand lab already read: each store file (one store's products.json pages) as a
 * Shopify source with its readings, dated when the lab read them, and the lab's photo vectors for
 * the listings whose first photo it embedded. Approved, since the lab's list was already vetted.
 * Prices wait for the first crawl: the lab never recorded a store's currency.
 */
export async function importLab(db: HubDb, productsDir: string, vectorsFile?: string, log: (line: string) => void = () => {}): Promise<LabImport> {
  const lab = await contributorId(db, LAB.handle, LAB.kind);
  let vectors: Map<string, number> | null = null;
  let matrix: ReturnType<typeof readNpz>[string] | null = null;
  if (vectorsFile) {
    const npz = readNpz(new Uint8Array(await readFile(vectorsFile)));
    if (!npz.keys || !npz.vecs) throw new Error(`${vectorsFile} has no keys and vecs arrays`);
    vectors = new Map(npyStrings(npz.keys).map((key, i) => [key, i]));
    matrix = npz.vecs;
  }

  const result: LabImport = { stores: 0, skipped: 0, listings: 0, added: 0, vectors: 0 };
  const files = (await readdir(productsDir)).filter((f) => f.endsWith(".json")).sort();
  for (const [n, file] of files.entries()) {
    const path = join(productsDir, file);
    const parsed = storeFileSchema.safeParse(JSON.parse(await readFile(path, "utf8")));
    if (!parsed.success || parsed.data.status !== "ok" || !parsed.data.host || !parsed.data.products?.length) {
      result.skipped++;
      continue;
    }
    const domain = domainOf(parsed.data.host);
    const origin = new URL(`https://${parsed.data.host}`);
    const readAt = (await stat(path)).mtime;
    await db
      .insert(source)
      .values({
        domain,
        status: "approved",
        readerId: "shopify",
        readerEvidence: { from: "lab import" },
        readerAssignedById: lab,
        readerAssignedAt: readAt,
        addedById: lab,
        lastCrawledAt: readAt,
      })
      .onConflictDoNothing({ target: source.domain });
    const [site] = await db.select({ id: source.id }).from(source).where(eq(source.domain, domain));

    const readings = parsed.data.products.flatMap((raw) => {
      const product = shopifyProductSchema.safeParse(raw);
      return product.success ? [shopifyReading(product.data, origin, null)] : [];
    });
    const counts = await storeReadings(db, site!.id, readings, { crawlId: null, readAt });
    result.stores++;
    result.listings += counts.seen;
    result.added += counts.added;

    if (vectors && matrix) {
      const wanted = readings.flatMap((r) => {
        const index = r.images?.[0] ? vectors!.get(photoKey(r.images[0].url)) : undefined;
        return index === undefined ? [] : [{ externalId: r.externalId, index }];
      });
      if (wanted.length) {
        const ids = await db
          .select({ id: listing.id, externalId: listing.externalId })
          .from(listing)
          .where(and(eq(listing.sourceId, site!.id), inArray(listing.externalId, wanted.map((w) => w.externalId))));
        const byExternal = new Map(ids.map((row) => [row.externalId, row.id]));
        const rows = wanted.flatMap((w) => {
          const listingId = byExternal.get(w.externalId);
          return listingId ? [{ listingId, model: LAB_PHOTO_MODEL, kind: "photo", vector: npyRow(matrix!, w.index), createdAt: readAt }] : [];
        });
        for (let i = 0; i < rows.length; i += 500) {
          await db.insert(embedding).values(rows.slice(i, i + 500)).onConflictDoNothing();
        }
        result.vectors += rows.length;
      }
    }
    if ((n + 1) % 50 === 0) log(`${n + 1} of ${files.length} files: ${JSON.stringify(result)}`);
  }
  return result;
}
