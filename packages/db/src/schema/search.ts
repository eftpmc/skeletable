import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { brand } from "./closet.js";

/** A store or marketplace that offers products (Best Buy, eBay, an indie Shopify store…). */
export const store = pgTable("store", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  domain: text("domain").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** A canonical product, shared across stores. Offers for the same product point at it. */
export const product = pgTable(
  "product",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id").references(() => brand.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    // Lowercased brand + title with noise removed; the fallback key for grouping offers.
    matchKey: text("match_key").notNull(),
    gtin: text("gtin"),
    mpn: text("mpn"),
    // Model code pulled from the title ("WH-1000XM5" → "wh1000xm5"), for matching without a GTIN.
    model: text("model"),
    category: text("category"),
    imageUrl: text("image_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("product_gtin_idx").on(table.gtin),
    index("product_match_key_idx").on(table.matchKey),
    index("product_model_idx").on(table.model),
  ],
);

/** One listing at one store: a price for a product in a condition. */
export const offer = pgTable(
  "offer",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id").references(() => product.id, { onDelete: "set null" }),
    storeId: uuid("store_id")
      .notNull()
      .references(() => store.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    url: text("url").notNull(),
    title: text("title").notNull(),
    brand: text("brand"),
    priceCents: integer("price_cents").notNull(),
    currency: text("currency").notNull(),
    condition: text("condition").notNull(),
    imageUrl: text("image_url"),
    inStock: boolean("in_stock").notNull().default(true),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("offer_url_unique").on(table.url), index("offer_product_idx").on(table.productId)],
);

/** Price history for an offer. A row is written when the price changes or once a day. */
export const pricePoint = pgTable(
  "price_point",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    offerId: uuid("offer_id")
      .notNull()
      .references(() => offer.id, { onDelete: "cascade" }),
    priceCents: integer("price_cents").notNull(),
    seenAt: timestamp("seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("price_point_offer_idx").on(table.offerId, table.seenAt)],
);
