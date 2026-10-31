import type { Table } from "@skeleton/tables/format";
import { Hono } from "hono";
import { handleMcp } from "./mcp.js";
import { homePage, notFoundPage, tablePage } from "./site.js";

/** The server: the site, the MCP endpoint, and a health check that says how much it's serving. */
export function createApp(tables: Table[]) {
  const app = new Hono();
  app.get("/health", (c) => c.json({ ok: true, tables: tables.length }));
  app.all("/mcp", (c) => handleMcp(tables, c.req.raw));
  app.get("/", (c) => {
    const url = new URL(c.req.url);
    const protocol = c.req.header("x-forwarded-proto") ?? url.protocol.replace(":", "");
    return c.html(homePage(tables, c.req.query("q") ?? "", `${protocol}://${url.host}`));
  });
  app.get("/tables/:slug", (c) => {
    const table = tables.find((t) => t.slug === c.req.param("slug"));
    return table ? c.html(tablePage(table)) : c.notFound();
  });
  app.notFound((c) => c.html(notFoundPage(), 404));
  return app;
}
