import type { Table } from "@skeleton/tables/format";
import { Hono } from "hono";
import { handleMcp } from "./mcp.js";

/** The server: the MCP endpoint, and a health check that says how much it's serving. */
export function createApp(tables: Table[]) {
  const app = new Hono();
  app.get("/health", (c) => c.json({ ok: true, tables: tables.length }));
  app.all("/mcp", (c) => handleMcp(tables, c.req.raw));
  return app;
}
