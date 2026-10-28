import { fieldVersion, type Reading } from "@skeleton/formats";
import { type HubDb, schema } from "@skeleton/hub-db";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { areaOf } from "@skeleton/shared";
import { contributorId, HUB } from "../contributors.js";
import { category, departmentWords, isKids, womenByGarment } from "./taxonomy.js";

const { listing, listingAnnotation, reading } = schema;

// Names the rules in each annotation they make, so a change to them can be told apart and redone.
export const RULES_VERSION = "taxonomy-1";
const BATCH = 2000;
// A site whose word-named departments are this one-sided lends its side to listings that name none.
const SITE_SIDE = 0.8;

type Draft = { listingId: string; readingId: number; field: string; value: unknown; confidence: number };

/** What the words on a listing say, as annotation drafts: category, area, audience and department. */
export function ruleDrafts(listingId: string, readingId: number, r: Reading): Draft[] {
  const found = category(r.title, r.productType, r.tags);
  const drafts: Draft[] = [];
  const add = (field: string, value: unknown, confidence: number) => drafts.push({ listingId, readingId, field, value, confidence });
  if (!found.category || found.category === "other") return drafts;
  add("category", found.category, found.how === "type" ? 0.8 : found.how === "title" ? 0.7 : 0.5);
  add("area", areaOf(found.category), 0.9);
  add("audience", isKids(r.title, r.productType, r.tags) ? "kids" : "adults", 0.7);
  const side = departmentWords(r.title, r.productType, r.tags);
  if (side) add("department", side, 0.7);
  else if (womenByGarment(found.category, r.title)) add("department", "women", 0.6);
  return drafts;
}

/**
 * Annotate listings from their words with the hub's rules: every active listing whose latest
 * reading the current rules haven't seen yet. A second pass gives listings that name no side the
 * side of a site that is clearly one-sided. Returns how many annotations were added.
 */
export async function annotateByRules(db: HubDb, log: (line: string) => void = () => {}): Promise<number> {
  const hub = await contributorId(db, HUB.handle, HUB.kind);
  let added = 0;
  let after = "00000000-0000-0000-0000-000000000000";
  for (;;) {
    // The latest reading of each active listing, in id order, skipping readings these rules already annotated.
    const rows = await db
      .selectDistinctOn([listing.id], { listingId: listing.id, sourceId: listing.sourceId, readingId: reading.id, data: reading.data })
      .from(listing)
      .innerJoin(reading, eq(reading.listingId, listing.id))
      .where(and(isNull(listing.goneAt), sql`${listing.id} > ${after}`))
      .orderBy(listing.id, sql`${reading.readAt} desc`, sql`${reading.id} desc`)
      .limit(BATCH);
    if (!rows.length) break;
    after = rows.at(-1)!.listingId;
    const seen = new Set(
      (
        await db
          .selectDistinct({ readingId: listingAnnotation.readingId })
          .from(listingAnnotation)
          .where(and(eq(listingAnnotation.promptVersion, RULES_VERSION), inArray(listingAnnotation.readingId, rows.map((r) => r.readingId))))
      ).map((r) => r.readingId),
    );
    const drafts = rows.filter((r) => !seen.has(r.readingId)).flatMap((r) => ruleDrafts(r.listingId, r.readingId, r.data as Reading));
    if (drafts.length) {
      await db.insert(listingAnnotation).values(
        drafts.map((d) => ({
          listingId: d.listingId,
          readingId: d.readingId,
          field: d.field,
          fieldVersion: fieldVersion("listing", d.field),
          value: d.value,
          confidence: d.confidence,
          method: "rule",
          promptVersion: RULES_VERSION,
          contributorId: hub,
        })),
      );
      added += drafts.length;
    }
    log(`rules: ${added} annotations so far`);
  }
  added += await siteSides(db, hub);
  return added;
}

/** Listings with a category but no side take their site's side when the site is at least 80% one side. */
async function siteSides(db: HubDb, hub: string): Promise<number> {
  const result = await db.execute(sql`
    with sides as (
      select l.source_id, a.value #>> '{}' as side, count(*) as n
      from listing_annotation a join listing l on l.id = a.listing_id
      where a.field = 'department' and a.method = 'rule' and a.prompt_version = ${RULES_VERSION} and l.gone_at is null
      group by l.source_id, side
    ), site as (
      select source_id, side from (
        select source_id, side, n, sum(n) over (partition by source_id) as total,
               row_number() over (partition by source_id order by n desc) as place
        from sides
      ) s
      where place = 1 and side in ('women', 'men') and n >= ${SITE_SIDE} * total and total >= 5
    )
    insert into listing_annotation (listing_id, reading_id, field, field_version, value, confidence, reason, method, prompt_version, contributor_id)
    select c.listing_id, c.reading_id, 'department', ${fieldVersion("listing", "department")}, to_jsonb(site.side), 0.5,
           'the site''s listings are mostly this side', 'rule', ${RULES_VERSION}, ${hub}
    from listing_annotation c
    join listing l on l.id = c.listing_id and l.gone_at is null
    join site on site.source_id = l.source_id
    where c.field = 'category' and c.prompt_version = ${RULES_VERSION}
      and not exists (select 1 from listing_annotation d where d.listing_id = c.listing_id and d.field = 'department')`);
  return result.count;
}
