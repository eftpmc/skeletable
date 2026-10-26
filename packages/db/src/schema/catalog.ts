import { index, integer, pgTable, primaryKey, real, text, timestamp, uuid, vector } from "drizzle-orm/pg-core";
import { user } from "./auth.js";
import { brand } from "./closet.js";

/** Dimensions of the photo vectors (CLIP ViT-B/32), shared by brands and anything compared to them. */
export const PHOTO_DIMENSIONS = 512;

/**
 * What the catalog knows about a brand: found by the brand lab (lab/brands), refreshed by imports.
 * "store" brands have a store we read and can be offered as finds. "name" brands are known from
 * other stores' listings (Uniqlo at a reseller): starting points only, never offered as finds.
 */
export const brandProfile = pgTable(
  "brand_profile",
  {
    brandId: uuid("brand_id")
      .primaryKey()
      .references(() => brand.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    site: text("site"),
    platform: text("platform"),
    country: text("country"),
    city: text("city"),
    description: text("description"),
    // Typical prices in whole US dollars (lower and upper quartile); null for "name" brands.
    priceLowUsd: integer("price_low_usd"),
    priceHighUsd: integer("price_high_usd"),
    // 0 to 1, learned from hand grades and votes.
    quality: real("quality").notNull().default(0),
    // For "name" brands: how many stores list it.
    seenAt: integer("seen_at"),
    // The mean of the brand's clothing photo vectors, normalized.
    look: vector("look", { dimensions: PHOTO_DIMENSIONS }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("brand_profile_look_idx").using("hnsw", table.look.op("vector_cosine_ops")),
    index("brand_profile_kind_quality_idx").on(table.kind, table.quality),
  ],
);

/** Product photos that show a brand's look, in display order. Images stay on the store's site. */
export const brandPhoto = pgTable(
  "brand_photo",
  {
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brand.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    imageUrl: text("image_url").notNull(),
    title: text("title"),
    priceUsd: real("price_usd"),
    productUrl: text("product_url"),
  },
  (table) => [primaryKey({ columns: [table.brandId, table.position] })],
);

/**
 * One vote per person per brand. "like": a find (taste and quality). "skip": not for me (taste only).
 * "flag": not a real brand, such as resale or dropshipping (quality only).
 */
export const brandVote = pgTable(
  "brand_vote",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brand.id, { onDelete: "cascade" }),
    verdict: text("verdict").notNull(),
    // Where it was cast: "brand:<id>" (a neighbors list) or "for-you".
    context: text("context"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.brandId] }), index("brand_vote_brand_idx").on(table.brandId)],
);
