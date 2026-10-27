import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth.js";

/**
 * Server-wide settings the owner changes in the app (the stores search uses, for now), one row per
 * key. Secrets inside a value are encrypted by the server before they get here.
 */
export const serverSetting = pgTable("server_setting", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
});
