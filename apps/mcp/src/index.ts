import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import type { AuthConfig } from "./auth.js";
import { connect, openLibrary } from "./db.js";
import { resendMailer } from "./email.js";
import { loadTables, type PublishedTable } from "./library.js";
import { startWatching } from "./watcher.js";

const dir = process.env.TABLES_DIR ?? "../../tables";
const { DATABASE_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, OWNER_EMAIL, PUBLIC_URL = "https://skeletable.com", RESEND_API_KEY, EMAIL_FROM = "Skeletable <notifications@skeletable.com>" } = process.env;
const sql = DATABASE_URL ? connect(DATABASE_URL) : undefined;
const library = sql ? await openLibrary(sql, dir) : undefined;
const tables: PublishedTable[] = library ? library.tables : await loadTables(dir);
if (sql && library) startWatching(sql, tables, library.refresh);
const auth: AuthConfig | undefined =
  sql && library && GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET
    ? { sql, clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET, publicUrl: PUBLIC_URL, ownerEmail: OWNER_EMAIL, tables, refresh: library.refresh, mail: RESEND_API_KEY ? resendMailer(RESEND_API_KEY, EMAIL_FROM) : undefined }
    : undefined;
const port = Number(process.env.PORT ?? 4200);
serve({ fetch: createApp(tables, process.env.WEB_DIR ?? "../web/dist", auth).fetch, port });
console.log(`Serving ${tables.length} tables at http://localhost:${port}/mcp`);
