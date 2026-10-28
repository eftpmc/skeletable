import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth.js";
import { product } from "./search.js";

/** A product someone is tracking. Drops from the price we last told them about create alerts. */
export const watch = pgTable(
  "watch",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    // Only watch this condition's best price; null means the best price in any condition.
    condition: text("condition"),
    // Best price when they started tracking, and the last price a drop was measured from.
    savedPriceCents: integer("saved_price_cents"),
    lastPriceCents: integer("last_price_cents"),
    currency: text("currency"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("watch_user_product_unique").on(table.userId, table.productId)],
);

/** A search someone saved. It re-runs on a schedule and new products become "N new". */
export const savedSearch = pgTable(
  "saved_search",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    query: text("query").notNull(),
    condition: text("condition"),
    // Whole dollars, like the search filter.
    maxPrice: integer("max_price"),
    intent: jsonb("intent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    // Products first seen after this are new to the person.
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("saved_search_user_idx").on(table.userId)],
);

/** Products a saved search has already shown, so re-runs can tell what's new. */
export const savedSearchSeen = pgTable(
  "saved_search_seen",
  {
    savedSearchId: uuid("saved_search_id")
      .notNull()
      .references(() => savedSearch.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.savedSearchId, table.productId] })],
);

/** Something worth telling the person: new matches for a saved search, or a price drop on a watch. */
export const alertEvent = pgTable(
  "alert_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    savedSearchId: uuid("saved_search_id").references(() => savedSearch.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => product.id, { onDelete: "cascade" }),
    // new_matches: how many; price_drop: from and to.
    count: integer("count"),
    fromPriceCents: integer("from_price_cents"),
    toPriceCents: integer("to_price_cents"),
    currency: text("currency"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
    // When it went out by ntfy and in a morning email.
    pushedAt: timestamp("pushed_at", { withTimezone: true }),
    emailedAt: timestamp("emailed_at", { withTimezone: true }),
  },
  (table) => [index("alert_event_user_idx").on(table.userId, table.createdAt)],
);

/** Where someone wants alerts sent outside the app. */
export const notifySettings = pgTable("notify_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  // An ntfy topic URL (https://ntfy.sh/<topic> or a self-hosted server). Null means off.
  ntfyUrl: text("ntfy_url"),
  emailDigest: boolean("email_digest").notNull().default(false),
  // IANA zone, so the digest arrives in their morning.
  timezone: text("timezone").notNull().default("UTC"),
  // Only alerts from after a channel was turned on go out on it, not the backlog.
  ntfySince: timestamp("ntfy_since", { withTimezone: true }),
  emailSince: timestamp("email_since", { withTimezone: true }),
  lastDigestAt: timestamp("last_digest_at", { withTimezone: true }),
});
