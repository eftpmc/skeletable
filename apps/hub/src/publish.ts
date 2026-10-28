import { createReadStream } from "node:fs";
import { type HubDb, schema } from "@skeleton/hub-db";
import { and, asc, desc, eq, isNotNull, notInArray } from "drizzle-orm";

const { catalogBuild, catalogChunk } = schema;

const CHUNK_BYTES = 4 * 1024 * 1024;
// Published builds that keep their file; an app mid-download of the one before still finishes.
export const KEEP_PUBLISHED = 2;

/** Store a build's file for the hub to serve, and drop the files of builds older than the last few. */
export async function publishBuild(db: HubDb, buildId: string, file: string, chunkBytes = CHUNK_BYTES): Promise<{ chunks: number; bytes: number }> {
  let n = 0;
  let bytes = 0;
  await db.transaction(async (tx) => {
    for await (const piece of createReadStream(file, { highWaterMark: chunkBytes })) {
      const chunk = piece as Buffer;
      await tx.insert(catalogChunk).values({ buildId, n: n++, bytes: chunk });
      bytes += chunk.length;
    }
    const done = await tx.update(catalogBuild).set({ publishedAt: new Date() }).where(eq(catalogBuild.id, buildId)).returning({ id: catalogBuild.id });
    if (!done.length) throw new Error(`no build ${buildId}`);
  });
  const kept = (
    await db.select({ id: catalogBuild.id }).from(catalogBuild).where(isNotNull(catalogBuild.publishedAt)).orderBy(desc(catalogBuild.publishedAt)).limit(KEEP_PUBLISHED)
  ).map((b) => b.id);
  await db.delete(catalogChunk).where(notInArray(catalogChunk.buildId, kept));
  return { chunks: n, bytes };
}

export async function latestPublished(db: HubDb) {
  const [build] = await db
    .select({ id: catalogBuild.id, sha256: catalogBuild.sha256, counts: catalogBuild.counts, publishedAt: catalogBuild.publishedAt })
    .from(catalogBuild)
    .where(isNotNull(catalogBuild.publishedAt))
    .orderBy(desc(catalogBuild.publishedAt))
    .limit(1);
  return build ?? null;
}

/** A published build's file as a stream, read one stored piece at a time. */
export function buildStream(db: HubDb, buildId: string): ReadableStream<Uint8Array> {
  let n = 0;
  return new ReadableStream({
    async pull(controller) {
      const [chunk] = await db
        .select({ bytes: catalogChunk.bytes })
        .from(catalogChunk)
        .where(and(eq(catalogChunk.buildId, buildId), eq(catalogChunk.n, n++)))
        .orderBy(asc(catalogChunk.n));
      if (chunk) controller.enqueue(new Uint8Array(chunk.bytes));
      else controller.close();
    },
  });
}
