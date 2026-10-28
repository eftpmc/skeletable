import { type HubDb, schema } from "@skeleton/hub-db";
import { eq } from "drizzle-orm";
import { politeContext, readers } from "@skeleton/engine";
import { contributorId, HUB } from "./contributors.js";
import { httpsOrigin, type CrawlOptions } from "./engine/crawl.js";

const { reader: readerTable, source } = schema;

/** A site's key: its lowercased host without "www." (and its port, when it has one). */
export function domainOf(input: string): string {
  const url = new URL(/^[a-z]+:\/\//i.test(input) ? input : `https://${input}`);
  return url.host.toLowerCase().replace(/^www\./, "");
}

export type AddedSource = { id: string; domain: string; created: boolean; readerId: string | null };

/**
 * Add a site as a candidate (or find it, if it's already known) and, when it has no reader yet,
 * try each enabled reader's detection in turn. The first that recognises the site is assigned,
 * with its evidence; a site none recognises stays unassigned until a recipe is written for it.
 */
export async function addSource(db: HubDb, input: string, addedBy?: string, options: CrawlOptions = {}): Promise<AddedSource> {
  const domain = domainOf(input);
  const inserted = await db
    .insert(source)
    .values({ domain, addedById: addedBy ?? null, ownerId: addedBy ?? null })
    .onConflictDoNothing({ target: source.domain })
    .returning({ id: source.id });
  const [site] = await db.select().from(source).where(eq(source.domain, domain));
  if (!site) throw new Error(`could not add ${domain}`);
  const result = { id: site.id, domain, created: inserted.length > 0, readerId: site.readerId };
  if (site.readerId) return result;
  const assigned = await detectReader(db, site.id, options);
  return { ...result, readerId: assigned };
}

/** Try the enabled readers on a source and assign the first that recognises it. */
export async function detectReader(db: HubDb, sourceId: string, options: CrawlOptions = {}): Promise<string | null> {
  const [site] = await db.select().from(source).where(eq(source.id, sourceId));
  if (!site) throw new Error(`no source ${sourceId}`);
  const enabled = new Set(
    (await db.select({ id: readerTable.id }).from(readerTable).where(eq(readerTable.enabled, true))).map((r) => r.id),
  );
  const origin = (options.originOf ?? httpsOrigin)(site.domain);
  const ctx = await politeContext(origin, options);
  for (const reader of readers.filter((r) => enabled.has(r.id))) {
    const found = await reader.detect(origin, ctx);
    if (!found) continue;
    await assignReader(db, sourceId, reader.id, { evidence: found.evidence, config: found.config ?? null, by: await contributorId(db, HUB.handle, HUB.kind) });
    return reader.id;
  }
  return null;
}

/** Point a source at a reader, recording who decided, when and why. */
export async function assignReader(
  db: HubDb,
  sourceId: string,
  readerId: string,
  how: { evidence: Record<string, unknown>; config: Record<string, unknown> | null; by: string },
) {
  await db
    .update(source)
    .set({ readerId, readerConfig: how.config, readerEvidence: how.evidence, readerAssignedById: how.by, readerAssignedAt: new Date() })
    .where(eq(source.id, sourceId));
}
