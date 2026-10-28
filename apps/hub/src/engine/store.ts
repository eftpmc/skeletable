import { createHash } from "node:crypto";
import { READING_FORMAT, readingSchema, type Reading, type ReadingInput } from "@skeleton/formats";
import { type HubDb, schema } from "@skeleton/hub-db";
import { desc, inArray, sql } from "drizzle-orm";

const { listing, reading } = schema;

export type StoreCounts = { seen: number; added: number; changed: number; invalid: number };

const hashOf = (value: Reading) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/**
 * Record what a site showed: each listing is found by the site's own id (created the first time),
 * marked seen, and gets a new reading only when its content changed since the last one. Readings
 * that don't fit the reading format are counted and skipped, never stored half-right.
 */
export async function storeReadings(
  db: HubDb,
  sourceId: string,
  inputs: ReadingInput[],
  at: { crawlId: string | null; readAt: Date },
): Promise<StoreCounts> {
  const counts: StoreCounts = { seen: 0, added: 0, changed: 0, invalid: 0 };
  const byId = new Map<string, Reading>();
  for (const input of inputs) {
    const parsed = readingSchema.safeParse(input);
    if (parsed.success) byId.set(parsed.data.externalId, parsed.data);
    else counts.invalid++;
  }
  if (!byId.size) return counts;
  const readings = [...byId.values()];
  counts.seen = readings.length;

  return db.transaction(async (tx) => {
    const rows = await tx
      .insert(listing)
      .values(readings.map((r) => ({ sourceId, externalId: r.externalId, url: r.url, firstSeenAt: at.readAt, lastSeenAt: at.readAt })))
      .onConflictDoUpdate({
        target: [listing.sourceId, listing.externalId],
        set: { url: sql`excluded.url`, lastSeenAt: sql`excluded.last_seen_at`, goneAt: null },
      })
      .returning({ id: listing.id, externalId: listing.externalId });
    const ids = new Map(rows.map((row) => [row.externalId, row.id]));

    const latest = await tx
      .selectDistinctOn([reading.listingId], { listingId: reading.listingId, contentHash: reading.contentHash })
      .from(reading)
      .where(inArray(reading.listingId, [...ids.values()]))
      .orderBy(reading.listingId, desc(reading.readAt), desc(reading.id));
    const previous = new Map(latest.map((row) => [row.listingId, row.contentHash]));

    const fresh = readings.flatMap((r) => {
      const listingId = ids.get(r.externalId)!;
      const contentHash = hashOf(r);
      const before = previous.get(listingId);
      if (before === contentHash) return [];
      if (before === undefined) counts.added++;
      else counts.changed++;
      return [{ listingId, crawlId: at.crawlId, formatVersion: READING_FORMAT, contentHash, data: r, readAt: at.readAt }];
    });
    if (fresh.length) await tx.insert(reading).values(fresh);
    return counts;
  });
}
