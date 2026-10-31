import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { openLibrary } from "./db.js";
import { loadTables } from "./library.js";

const dir = process.env.TABLES_DIR ?? "../../tables";
const tables = process.env.DATABASE_URL ? await openLibrary(process.env.DATABASE_URL, dir) : await loadTables(dir);
const port = Number(process.env.PORT ?? 4200);
serve({ fetch: createApp(tables, process.env.WEB_DIR ?? "../web/dist").fetch, port });
console.log(`Serving ${tables.length} tables at http://localhost:${port}/mcp`);
