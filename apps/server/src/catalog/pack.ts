import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { type Db, schema } from "@skeleton/db";
import { eq } from "drizzle-orm";
import { readHubCatalog } from "./hub-catalog.js";
import { importCatalog } from "./import.js";

const { catalogPack } = schema;

/**
 * A pack's bytes: a local file, or a URL to download (https, or http on a private network such as a
 * hub beside the app). With `sha256`, a download that doesn't match is refused.
 */
export async function readPack(source: string, sha256?: string): Promise<Buffer> {
  let data: Buffer;
  if (/^https?:\/\//.test(source)) {
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
 * Import a catalog file (the hub's build, format 2: gzipped JSON lines) unless this exact file was
 * imported before. Every deploy and every self-hosted copy starts with the catalog; votes and
 * Collection links survive because brands are matched, not replaced.
 */
export async function importPackIfNew(db: Db, source: string, sha256?: string) {
  // A served catalog publishes its hash beside it, so an unchanged one isn't downloaded again.
  const published = /^https?:\/\//.test(source) ? await publishedHash(source) : null;
  if (published) {
    const [seen] = await db.select({ hash: catalogPack.hash }).from(catalogPack).where(eq(catalogPack.hash, published));
    if (seen) return { hash: published, imported: false as const };
  }
  const data = await readPack(source, sha256 ?? published ?? undefined);
  const hash = createHash("sha256").update(data).digest("hex");
  const [done] = await db.select({ hash: catalogPack.hash }).from(catalogPack).where(eq(catalogPack.hash, hash));
  if (done) return { hash, imported: false as const };
  const catalog = readHubCatalog(gunzipSync(data).toString("utf8").split("\n"));
  const counts = { ...(await importCatalog(db, catalog.records)), skipped: catalog.skipped };
  await db.insert(catalogPack).values({ hash, counts }).onConflictDoNothing();
  return { hash, imported: true as const, buildId: catalog.buildId, ...counts };
}

/** The hash a catalog server publishes at `<url>.sha256`, or null when it publishes none. */
async function publishedHash(source: string): Promise<string | null> {
  try {
    const res = await fetch(`${source}.sha256`, { signal: AbortSignal.timeout(30_000) });
    const text = res.ok ? (await res.text()).trim().toLowerCase() : "";
    return /^[0-9a-f]{64}$/.test(text) ? text : null;
  } catch {
    return null;
  }
}
