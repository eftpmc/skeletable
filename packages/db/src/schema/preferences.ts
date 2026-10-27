import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth.js";

/** What someone wants to see in Discover (packages/shared/src/taxonomy.ts). One row, made when they first answer. */
export const userPreference = pgTable("user_preference", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  // "women", "men" or "all"; null until they've said.
  shopFor: text("shop_for"),
  // Products above this rank lower; nothing is hidden for its price.
  priceMaxUsd: integer("price_max_usd"),
  hiddenCategories: text("hidden_categories").array().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
