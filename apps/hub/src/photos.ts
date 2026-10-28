import { type HubDb, schema } from "@skeleton/hub-db";
import { sql } from "drizzle-orm";
import { LAB_PHOTO_MODEL } from "./lab/import.js";

const { embedding } = schema;

// The photo model every listing is embedded with for now; the lab's vectors were made with it too.
export const PHOTO_MODEL = LAB_PHOTO_MODEL;
export const PHOTO_DIMENSIONS = 512;

export type PhotoToEmbed = { listingId: string; readingId: number; image: string };

/**
 * Active listings on approved sites whose latest reading has a photo but no vector from the photo
 * model yet: the list an embedder (embed/photos.py) works through.
 */
export async function photosToEmbed(db: HubDb, limit: number): Promise<PhotoToEmbed[]> {
  const rows = await db.execute<{ listing_id: string; reading_id: number; image: string }>(sql`
    select listing_id, reading_id, image from (
      select distinct on (l.id) l.id as listing_id, r.id as reading_id, r.data #>> '{images,0,url}' as image
      from listing l join source s on s.id = l.source_id and s.status = 'approved'
      join reading r on r.listing_id = l.id
      where l.gone_at is null
        and not exists (select 1 from embedding e where e.listing_id = l.id and e.model = ${PHOTO_MODEL} and e.kind = 'photo')
      order by l.id, r.read_at desc, r.id desc
    ) latest
    where image is not null
    limit ${limit}`);
  return rows.map((r) => ({ listingId: r.listing_id, readingId: Number(r.reading_id), image: r.image }));
}

/** A vector as the embedder writes it: little-endian float32, base64. */
export function decodeVector(base64: string): number[] {
  const bytes = Buffer.from(base64, "base64");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Array.from({ length: bytes.byteLength / 4 }, (_, i) => view.getFloat32(i * 4, true));
}

/**
 * Store an embedder's output lines ({ listingId, readingId, vector }) as photo vectors. Lines that
 * aren't a full vector are skipped; a listing that already has one keeps it.
 */
export async function loadPhotoVectors(db: HubDb, lines: string[]): Promise<{ stored: number; skipped: number }> {
  let stored = 0;
  let skipped = 0;
  const rows: (typeof embedding.$inferInsert)[] = [];
  const flush = async () => {
    if (!rows.length) return;
    const done = await db.insert(embedding).values(rows.splice(0)).onConflictDoNothing().returning({ listingId: embedding.listingId });
    stored += done.length;
  };
  for (const line of lines) {
    if (!line.trim()) continue;
    let parsed: { listingId?: unknown; readingId?: unknown; vector?: unknown };
    try {
      parsed = JSON.parse(line);
    } catch {
      skipped++;
      continue;
    }
    const vector = typeof parsed.vector === "string" ? decodeVector(parsed.vector) : [];
    if (typeof parsed.listingId !== "string" || vector.length !== PHOTO_DIMENSIONS || vector.some((v) => !Number.isFinite(v))) {
      skipped++;
      continue;
    }
    rows.push({ listingId: parsed.listingId, readingId: typeof parsed.readingId === "number" ? parsed.readingId : null, model: PHOTO_MODEL, kind: "photo", vector });
    if (rows.length >= 500) await flush();
  }
  await flush();
  return { stored, skipped };
}
