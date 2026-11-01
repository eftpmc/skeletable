import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import type { AuthConfig } from "./auth.js";
import { connect, openLibrary } from "./db.js";
import { loadTables } from "./library.js";

const dir = process.env.TABLES_DIR ?? "../../tables";
const { DATABASE_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, OWNER_EMAIL, PUBLIC_URL = "https://skeletable.com" } = process.env;
const sql = DATABASE_URL ? connect(DATABASE_URL) : undefined;
const tables = sql ? await openLibrary(sql, dir) : await loadTables(dir);
const auth: AuthConfig | undefined =
  sql && GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET
    ? { sql, clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET, publicUrl: PUBLIC_URL, ownerEmail: OWNER_EMAIL }
    : undefined;
const port = Number(process.env.PORT ?? 4200);
serve({ fetch: createApp(tables, process.env.WEB_DIR ?? "../web/dist", auth).fetch, port });
console.log(`Serving ${tables.length} tables at http://localhost:${port}/mcp`);
