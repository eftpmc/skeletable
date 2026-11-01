import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Table } from "@skeleton/tables/format";
import { Hono } from "hono";
import { authRoutes, type AuthConfig } from "./auth.js";
import { searchTables, summarize } from "./library.js";
import { notifyOwners } from "./email.js";
import { handleMcp, type Propose } from "./mcp.js";
import { pageRoutes } from "./pages.js";
import { submitProposal, tokenUser } from "./proposals.js";
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
  if (auth) {
    // Counts only, with no address or identity, so we can see if anyone's here.
    app.use("*", async (c, next) => {
      const name = c.req.path === "/mcp" ? "mcp" : c.req.path.startsWith("/api/") || c.req.path.startsWith("/assets/") || c.req.path === "/health" ? null : "page";
      if (name) {
        auth.sql`insert into daily_counts (day, name, count) values (current_date, ${name}, 1) on conflict (day, name) do update set count = daily_counts.count + 1`.catch(() => {});
      }
      await next();
    });
  }
  app.use("/mcp", rateLimit(MCP_PER_MINUTE));
  app.use("/api/*", rateLimit(API_PER_MINUTE));
  app.use("/auth/*", rateLimit(SIGN_IN_PER_MINUTE));
  app.all("/mcp", (c) => {
    if (!auth) return handleMcp(tables, c.req.raw);
    const propose: Propose = async (input) => {
      const userId = await tokenUser(auth.sql, c.req.header("authorization"));
      if (!userId) return { error: "Proposing needs a token. Create one in Skeletable under Settings, and send it as a Bearer token." };
      const result = await submitProposal(auth.sql, tables, input, userId, "agent", auth.pages);
      if ("id" in result) await notifyOwners(auth.sql, auth.mail, auth.publicUrl, result.id);
      return result;
    };
    return handleMcp(tables, c.req.raw, propose);
  });
  if (auth) app.route("/", authRoutes(auth));
  else app.get("/api/me", (c) => c.json({ canSignIn: false, user: null }));
  app.get("/api/tables", (c) => c.json(searchTables(tables, c.req.query("q")).map(summarize)));
  app.get("/api/tables/:owner/:slug", (c) => {
    const table = tables.find((t) => t.owner === c.req.param("owner") && t.slug === c.req.param("slug"));
    return table ? c.json(table) : c.json({ error: "No such table" }, 404);
  });
  app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));
  if (webDir && existsSync(join(resolve(webDir), "index.html"))) {
    const root = resolve(webDir);
    app.get("/assets/*", serveStatic({ root }));
    app.get("/logo.*", serveStatic({ root }));
    pageRoutes(app, tables, root, auth?.publicUrl ?? "https://skeletable.com");
  }
  app.onError((error, c) => {
    console.error(`${c.req.method} ${c.req.path}: ${error.stack ?? error}`);
    return c.json({ error: "Something went wrong on our side." }, 500);
  });
  return app;
}
