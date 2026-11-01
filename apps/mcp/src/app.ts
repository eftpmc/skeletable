import { join, resolve } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Table } from "@skeleton/tables/format";
import { Hono } from "hono";
import { authRoutes, type AuthConfig } from "./auth.js";
import { searchTables, summarize } from "./library.js";
import { handleMcp } from "./mcp.js";
import { rateLimit } from "./rate-limit.js";

// Generous for a person or an agent reading tables, and a brake on anything hammering the server.
const MCP_PER_MINUTE = 120;
const API_PER_MINUTE = 240;
const SIGN_IN_PER_MINUTE = 20;

/** The server: the MCP endpoint, the JSON the site reads, a health check, and the built site when there is one. */
export function createApp(tables: Table[], webDir?: string, auth?: AuthConfig) {
  const app = new Hono();
  app.use("*", async (c, next) => {
    const url = new URL(c.req.url);
    if (!url.hostname.startsWith("www.")) return next();
    return c.redirect(`https://${url.host.slice(4)}${url.pathname}${url.search}`, 301);
  });
  app.get("/health", (c) => c.json({ ok: true, tables: tables.length }));
  app.use("/mcp", rateLimit(MCP_PER_MINUTE));
  app.use("/api/*", rateLimit(API_PER_MINUTE));
  app.use("/auth/*", rateLimit(SIGN_IN_PER_MINUTE));
  app.all("/mcp", (c) => handleMcp(tables, c.req.raw));
  if (auth) app.route("/", authRoutes(auth));
  else app.get("/api/me", (c) => c.json({ canSignIn: false, user: null }));
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
