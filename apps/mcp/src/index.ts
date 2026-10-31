import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadTables } from "./library.js";

const tables = await loadTables(process.env.TABLES_DIR ?? "../../tables");
const port = Number(process.env.PORT ?? 4200);
serve({ fetch: createApp(tables, process.env.WEB_DIR ?? "../web/dist").fetch, port });
console.log(`Serving ${tables.length} tables at http://localhost:${port}/mcp`);
