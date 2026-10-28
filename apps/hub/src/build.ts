import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { once } from "node:events";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import {
  CATALOG_FORMAT,
  CATALOG_LICENCE,
  catalogLineSchema,
  packVector,
  type CatalogLine,
  type Reading,
} from "@skeleton/formats";
import { type HubDb, schema } from "@skeleton/hub-db";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { LAB_PHOTO_MODEL } from "./lab/import.js";
import { RESOLVER_VERSION } from "./resolve.js";

const { catalogBuild, embedding, listing, listingValue, reading, source, sourceValue } = schema;

// The embeddings the file carries. One model for now; a second sits beside it when it arrives.
const EMBEDDINGS = [{ model: LAB_PHOTO_MODEL, kind: "photo" as const, dimensions: 512 }];
const MAX_IMAGES = 10;

export type BuildResult = { buildId: string; file: string; sha256: string; sources: number; listings: number; skipped: Record<string, number> };

/**
 * Write the catalog file: every approved source with something to show, then its listings that are
 * still offered, have a final category, are for adults, and show a price and a photo. Each line is
 * checked against the catalog format before it's written; the build is recorded with its fingerprint.
 */
export async function buildCatalog(db: HubDb, file: string, log: (line: string) => void = () => {}): Promise<BuildResult> {
  const buildId = randomUUID();
  const skipped: Record<string, number> = { noCategory: 0, kids: 0, noPrice: 0, noPhoto: 0 };
  const counts = { sources: 0, listings: 0 };
  const gzip = createGzip();
  const out = pipeline(gzip, createWriteStream(file));
  const write = async (line: CatalogLine) => {
    if (!gzip.write(`${JSON.stringify(catalogLineSchema.parse(line))}\n`)) await once(gzip, "drain");
  };

  await write({
    type: "header",
    format: CATALOG_FORMAT,
    licence: CATALOG_LICENCE,
    buildId,
    builtAt: new Date().toISOString(),
    resolverVersion: RESOLVER_VERSION,
    embeddings: EMBEDDINGS,
  });

  const sites = await db.select({ id: source.id, domain: source.domain }).from(source).where(eq(source.status, "approved")).orderBy(source.domain);
  for (const [n, site] of sites.entries()) {
    const latest = await db
      .selectDistinctOn([listing.id], { id: listing.id, url: listing.url, data: reading.data })
      .from(listing)
      .innerJoin(reading, eq(reading.listingId, listing.id))
      .where(and(eq(listing.sourceId, site.id), isNull(listing.goneAt)))
      .orderBy(listing.id, sql`${reading.readAt} desc`, sql`${reading.id} desc`);
    if (!latest.length) continue;
    const ids = latest.map((l) => l.id);
    const values = new Map<string, Record<string, unknown>>();
    for (const row of await db.select().from(listingValue).where(inArray(listingValue.listingId, ids))) {
      values.set(row.listingId, { ...values.get(row.listingId), [row.field]: row.value });
    }
    const vectors = new Map<string, number[]>();
    for (const row of await db
      .select({ listingId: embedding.listingId, vector: embedding.vector })
      .from(embedding)
      .where(and(inArray(embedding.listingId, ids), eq(embedding.model, LAB_PHOTO_MODEL), eq(embedding.kind, "photo")))) {
      vectors.set(row.listingId, row.vector);
    }

    const lines: CatalogLine[] = [];
    for (const item of latest) {
      const r = item.data as Reading;
      const v = values.get(item.id) ?? {};
      if (!v.category) skipped.noCategory!++;
      else if (v.audience === "kids") skipped.kids!++;
      else if (!r.price) skipped.noPrice!++;
      else if (!r.images.length) skipped.noPhoto!++;
      else {
        const vector = vectors.get(item.id);
        lines.push({
          type: "listing",
          id: item.id,
          sourceId: site.id,
          url: item.url,
          title: r.title,
          maker: r.maker,
          price: r.price,
          available: r.available,
          images: r.images.slice(0, MAX_IMAGES),
          values: v,
          embeddings: vector ? { [LAB_PHOTO_MODEL]: packVector(vector) } : {},
        } as CatalogLine);
      }
    }
    if (!lines.length) continue;
    const siteValues = Object.fromEntries(
      (await db.select().from(sourceValue).where(eq(sourceValue.sourceId, site.id))).map((row) => [row.field, row.value]),
    );
    await write({ type: "source", id: site.id, domain: site.domain, values: siteValues } as CatalogLine);
    for (const line of lines) await write(line);
    counts.sources++;
    counts.listings += lines.length;
    if ((n + 1) % 50 === 0) log(`${n + 1} of ${sites.length} sites: ${counts.listings} listings`);
  }
  gzip.end();
  await out;

  const sha256 = await fileHash(file);
  await db.insert(catalogBuild).values({
    id: buildId,
    formatVersion: CATALOG_FORMAT,
    resolverVersion: RESOLVER_VERSION,
    sha256,
    counts: { ...counts, skipped },
  });
  return { buildId, file, sha256, ...counts, skipped };
}

async function fileHash(file: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(file), hash);
  return hash.digest("hex");
}
