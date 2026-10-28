import type { HubDb } from "@skeleton/hub-db";
import { sql } from "drizzle-orm";

/**
 * The rules that turn annotations into each field's final value. Bump the version when they change;
 * every final value records the version that chose it, so a change can be rolled out and checked.
 *
 * Version 1: a person's correction beats an agent's, an agent's beats a model's, a model's beats a
 * rule's; within one kind the most confident wins, then the newest.
 */
export const RESOLVER_VERSION = 1;

const rank = sql`case method when 'person' then 4 when 'agent' then 3 when 'model' then 2 else 1 end`;

/**
 * Bring final values up to date. With `listingIds`, only those listings; otherwise every listing
 * (one pass over the annotations, which is how a new resolver version is rolled out).
 */
export async function resolveListings(db: HubDb, listingIds?: string[]): Promise<number> {
  const only = listingIds ? sql`where listing_id in ${listingIds.length ? listingIds : [null]}` : sql``;
  const result = await db.execute(sql`
    insert into listing_value (listing_id, field, value, annotation_id, resolver_version, updated_at)
    select distinct on (listing_id, field) listing_id, field, value, id, ${RESOLVER_VERSION}, now()
    from listing_annotation
    ${only}
    order by listing_id, field, ${rank} desc, confidence desc nulls last, created_at desc, id desc
    on conflict (listing_id, field) do update
      set value = excluded.value, annotation_id = excluded.annotation_id,
          resolver_version = excluded.resolver_version, updated_at = excluded.updated_at
      where listing_value.annotation_id is distinct from excluded.annotation_id
         or listing_value.resolver_version is distinct from excluded.resolver_version`);
  return result.count;
}

/** As resolveListings, for sources. */
export async function resolveSources(db: HubDb): Promise<number> {
  const result = await db.execute(sql`
    insert into source_value (source_id, field, value, annotation_id, resolver_version, updated_at)
    select distinct on (source_id, field) source_id, field, value, id, ${RESOLVER_VERSION}, now()
    from source_annotation
    order by source_id, field, ${rank} desc, confidence desc nulls last, created_at desc, id desc
    on conflict (source_id, field) do update
      set value = excluded.value, annotation_id = excluded.annotation_id,
          resolver_version = excluded.resolver_version, updated_at = excluded.updated_at
      where source_value.annotation_id is distinct from excluded.annotation_id
         or source_value.resolver_version is distinct from excluded.resolver_version`);
  return result.count;
}
