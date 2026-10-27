import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { type Db, schema } from "@closet/db";
import { eq } from "drizzle-orm";
import { catalogRecordSchema, importCatalog } from "./import.js";

const { catalogPack } = schema;

/**
 * A pack's bytes: a file in the image, or (as the catalog grows past what an image should carry) an
 * https URL to download. With `sha256`, a download that doesn't match is refused.
 */
export async function readPack(source: string, sha256?: string): Promise<Buffer> {
  let data: Buffer;
  if (/^https:\/\//.test(source)) {
    const res = await fetch(source, { signal: AbortSignal.timeout(10 * 60 * 1000), redirect: "follow" });
    if (!res.ok) throw new Error(`catalog pack download failed: ${res.status}`);
    data = Buffer.from(await res.arrayBuffer());
  } else {
    data = await readFile(source);
  }
  if (sha256 && createHash("sha256").update(data).digest("hex") !== sha256.toLowerCase()) {
    throw new Error("catalog pack doesn't match CATALOG_PACK_SHA256");
  }
  return data;
}

/**
 * Import a catalog pack (the lab's export, gzipped JSON lines) unless this exact file was imported
 * before. Every deploy and every self-hosted copy starts with the catalog; votes and Collection
 * links survive because brands are matched, not replaced.
 */
export async function importPackIfNew(db: Db, source: string, sha256?: string) {
  const data = await readPack(source, sha256);
  const hash = createHash("sha256").update(data).digest("hex");
  const [done] = await db.select({ hash: catalogPack.hash }).from(catalogPack).where(eq(catalogPack.hash, hash));
  if (done) return { hash, imported: false as const };
  const records = gunzipSync(data)
    .toString("utf8")
    .split("\n")
    .filter(Boolean)
    .map((line, i) => {
      const parsed = catalogRecordSchema.safeParse(JSON.parse(line));
      if (!parsed.success) throw new Error(`catalog pack line ${i + 1}: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`);
      return parsed.data;
    });
  const counts = await importCatalog(db, records);
  await db.insert(catalogPack).values({ hash, counts }).onConflictDoNothing();
  return { hash, imported: true as const, ...counts };
}
