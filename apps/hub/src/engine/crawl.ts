import type { ReadingInput } from "@skeleton/formats";
import { type HubDb, schema } from "@skeleton/hub-db";
import { and, count, eq, isNull, lt } from "drizzle-orm";
import { politeContext, readerById, RobotsBlocked, type PoliteOptions } from "@skeleton/engine";
import { storeReadings } from "./store.js";

const { crawl, listing, source } = schema;

const BATCH = 250;
// A crawl that finds fewer than this share of the listings the site had is treated as a fault
// (a broken feed, a block, a redesign), not as the store emptying: nothing is marked gone and the
// source is paused for someone to look at.
const DROP_SHARE = 0.5;
const DROP_FLOOR = 20;

export type CrawlOptions = PoliteOptions & {
  // Where a domain is served; https by default. Tests point this at a local fixture server.
  originOf?: (domain: string) => URL;
};

export const httpsOrigin = (domain: string) => new URL(`https://${domain}`);

export type CrawlResult = {
  crawlId: string;
  status: "done" | "failed" | "blocked";
  seen: number;
  added: number;
  changed: number;
  gone: number;
  invalid: number;
  requests: number;
  paused: boolean;
  error?: string;
};

/**
 * One pass over a source with its assigned reader. Readings are stored as they come, in batches;
 * listings the pass didn't find are marked gone only when the pass finished and found most of what
 * the site had before.
 */
export async function crawlSource(db: HubDb, sourceId: string, options: CrawlOptions = {}): Promise<CrawlResult> {
  const [site] = await db.select().from(source).where(eq(source.id, sourceId));
  if (!site) throw new Error(`no source ${sourceId}`);
  const reader = readerById(site.readerId);
  if (!reader) throw new Error(`${site.domain} has no reader assigned that the hub can run`);

  const startedAt = new Date();
  const [row] = await db
    .insert(crawl)
    .values({ sourceId, readerId: reader.id, readerVersion: reader.version, startedAt })
    .returning({ id: crawl.id });
  const crawlId = row!.id;
  const [{ active }] = (await db
    .select({ active: count() })
    .from(listing)
    .where(and(eq(listing.sourceId, sourceId), isNull(listing.goneAt)))) as [{ active: number }];

  const totals = { seen: 0, added: 0, changed: 0, invalid: 0 };
  let status: CrawlResult["status"] = "done";
  let error: string | undefined;
  const origin = (options.originOf ?? httpsOrigin)(site.domain);
  const ctx = await politeContext(origin, options);
  let batch: ReadingInput[] = [];
  const flush = async () => {
    const counts = await storeReadings(db, sourceId, batch, { crawlId, readAt: startedAt });
    batch = [];
    for (const key of Object.keys(totals) as (keyof typeof totals)[]) totals[key] += counts[key];
  };

  try {
    for await (const input of reader.read(origin, site.readerConfig as Record<string, unknown> | null, ctx)) {
      batch.push(input);
      if (batch.length >= BATCH) await flush();
    }
    await flush();
  } catch (e) {
    status = e instanceof RobotsBlocked ? "blocked" : "failed";
    error = e instanceof Error ? e.message : String(e);
    if (batch.length) await flush().catch(() => {});
  }

  const dropped = status === "done" && active >= DROP_FLOOR && totals.seen < active * DROP_SHARE;
  let gone = 0;
  if (status === "done" && !dropped) {
    const marked = await db
      .update(listing)
      .set({ goneAt: startedAt })
      .where(and(eq(listing.sourceId, sourceId), isNull(listing.goneAt), lt(listing.lastSeenAt, startedAt)))
      .returning({ id: listing.id });
    gone = marked.length;
  }
  const paused = dropped || status === "blocked";
  const finishedAt = new Date();
  await db
    .update(crawl)
    .set({ status, finishedAt, stats: { ...totals, gone, active, requests: ctx.requests(), error, dropped } })
    .where(eq(crawl.id, crawlId));
  await db
    .update(source)
    .set({
      lastCrawledAt: finishedAt,
      nextCrawlAt: new Date(finishedAt.getTime() + site.crawlEveryHours * 3_600_000),
      ...(paused ? { status: "paused" } : {}),
    })
    .where(eq(source.id, sourceId));

  return { crawlId, status, ...totals, gone, requests: ctx.requests(), paused, error };
}
