import { sql } from "drizzle-orm";
import {
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth.js";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** Brands are shared across users; the catalog builds on them later. */
export const brand = pgTable("brand", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // Lowercased, whitespace-collapsed name used to dedupe.
  slug: text("slug").notNull().unique(),
  domain: text("domain"),
  ...timestamps,
});

export const item = pgTable(
  "item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id").references(() => brand.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    category: text("category").notNull(),
    colors: text("colors")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    size: text("size"),
    material: text("material"),
    notes: text("notes"),
    priceCents: integer("price_cents"),
    currency: text("currency"),
    purchasedOn: date("purchased_on"),
    sourceUrl: text("source_url"),
    source: text("source").notNull(),
    ...timestamps,
  },
  (table) => [index("item_user_idx").on(table.userId, table.createdAt)],
);

/** Uploaded or imported images. Attached to an item once the item is saved. */
export const media = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").references(() => item.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    colors: text("colors")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("media_item_idx").on(table.itemId, table.position)],
);

export const brandFit = pgTable(
  "brand_fit",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brand.id, { onDelete: "cascade" }),
    size: text("size"),
    note: text("note"),
    ...timestamps,
  },
  (table) => [primaryKey({ columns: [table.userId, table.brandId] })],
);

export const wearLog = pgTable(
  "wear_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "cascade" }),
    wornOn: date("worn_on").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("wear_log_item_day").on(table.itemId, table.wornOn)],
);
