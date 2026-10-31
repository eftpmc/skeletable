import { join, resolve } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Table } from "@skeleton/tables/format";
import { Hono } from "hono";
import { searchTables, summarize } from "./library.js";
import { handleMcp } from "./mcp.js";

/** The server: the MCP endpoint, the JSON the site reads, a health check, and the built site when there is one. */
export function createApp(tables: Table[], webDir?: string) {
  const app = new Hono();
  app.get("/health", (c) => c.json({ ok: true, tables: tables.length }));
  app.all("/mcp", (c) => handleMcp(tables, c.req.raw));
  app.get("/api/tables", (c) => c.json(searchTables(tables, c.req.query("q")).map(summarize)));
  app.get("/api/tables/:owner/:slug", (c) => {
    const table = tables.find((t) => t.owner === c.req.param("owner") && t.slug === c.req.param("slug"));
    return table ? c.json(table) : c.json({ error: "No such table" }, 404);
  });
  app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));
  if (webDir) {
    const root = resolve(webDir);
    app.use("/*", serveStatic({ root }));
    app.get("*", serveStatic({ path: join(root, "index.html") }));
  }
  return app;
}
