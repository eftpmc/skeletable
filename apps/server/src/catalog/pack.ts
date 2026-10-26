import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { type Db, schema } from "@closet/db";
import { eq } from "drizzle-orm";
import { catalogRecordSchema, importCatalog } from "./import.js";

const { catalogPack } = schema;

/**
 * Import a catalog pack (the lab's export, gzipped JSON lines) unless this exact file was imported
 * before. The app image ships one, so every deploy and every self-hosted copy starts with the
 * catalog; votes and Collection links survive because brands are matched, not replaced.
 */
export async function importPackIfNew(db: Db, path: string) {
  const data = await readFile(path);
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
