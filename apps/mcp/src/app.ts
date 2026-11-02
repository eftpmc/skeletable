import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono, type Context } from "hono";
import { canRead, everyone, readable, viewerFor } from "./access.js";
import { agentActions } from "./agents.js";
import { authRoutes, sessionViewer, type AuthConfig } from "./auth.js";
import { dataRoutes } from "./data.js";
import { checkCounts, searchTables, summarize, type PublishedTable } from "./library.js";
import { notifyOwners } from "./email.js";
import { blogRoutes, type Post } from "./posts.js";
import { handleMcp, type Propose } from "./mcp.js";
import { pageRoutes } from "./pages.js";
import { submitProposal, tokenUser } from "./proposals.js";
import { rateLimit } from "./rate-limit.js";
import { visitNames } from "./visits.js";
import { loadVersion } from "./versions.js";

// Generous for a person or an agent reading tables, and a brake on anything hammering the server.
const MCP_PER_MINUTE = 120;
const API_PER_MINUTE = 240;
const SIGN_IN_PER_MINUTE = 20;

/** The server: the MCP endpoint, the JSON the site reads, a health check, and the built site when there is one. */
export function createApp(tables: PublishedTable[], webDir?: string, auth?: AuthConfig, posts: Post[] = []) {
  const app = new Hono();
  const publicUrl = auth?.publicUrl ?? "https://skeletable.com";
  const viewerOf = (c: Context) => (auth ? sessionViewer(auth.sql, c) : Promise.resolve(everyone));
  app.use("*", async (c, next) => {
    const url = new URL(c.req.url);
    if (!url.hostname.startsWith("www.")) return next();
    return c.redirect(`https://${url.host.slice(4)}${url.pathname}${url.search}`, 301);
  });
  app.get("/health", (c) => c.json({ ok: true, tables: readable(tables, everyone).length }));
  if (auth) {
    // Counts only, with no address or identity, so we can see if anyone's here.
    app.use("*", async (c, next) => {
      for (const name of visitNames(c.req.path, c.req.header("user-agent"), c.req.header("referer"))) {
        auth.sql`insert into daily_counts (day, name, count) values (current_date, ${name}, 1) on conflict (day, name) do update set count = daily_counts.count + 1`.catch(() => {});
      }
      await next();
    });
  }
  app.use("/mcp", rateLimit(MCP_PER_MINUTE));
  app.use("/api/*", rateLimit(API_PER_MINUTE));
  // A signed-in answer can hold private tables, so no cache along the way may keep it.
  app.use("/api/*", async (c, next) => {
    await next();
    if (c.req.header("cookie")) c.header("cache-control", "private, no-store");
  });
  app.use("/auth/*", rateLimit(SIGN_IN_PER_MINUTE));
  app.all("/mcp", async (c) => {
    if (!auth) return handleMcp(readable(tables, everyone), publicUrl, c.req.raw);
    // A token lets an agent see what its person can. Without one, it's the public library.
    const userId = await tokenUser(auth.sql, c.req.header("authorization"));
    const visible = readable(tables, userId ? await viewerFor(auth.sql, userId) : everyone);
    const propose: Propose = async (input) => {
      if (!userId) return { error: "Proposing needs a token. Create one in Skeletable under Settings, and send it as a Bearer token." };
      const result = await submitProposal(auth.sql, visible, input, userId, "agent", auth.pages);
      if ("id" in result) await notifyOwners(auth.sql, auth.mail, auth.publicUrl, result.id);
      return result;
    };
    return handleMcp(visible, publicUrl, c.req.raw, propose, userId ? agentActions(auth.sql, tables, userId, publicUrl, auth.refresh, auth.pages) : null, (table, number) => loadVersion(auth.sql, table, number));
  });
  if (auth) app.route("/", authRoutes(auth));
  else {
    app.get("/api/me", (c) => c.json({ canSignIn: false, user: null }));
    // The public preview has no database, but its table tabs should still be usable.
    // Auth-backed servers replace these with the real proposal and history routes above.
    app.get("/api/tables/:owner/:slug/proposals", (c) => c.json([]));
    app.get("/api/tables/:owner/:slug/history", (c) => c.json([]));
  }
  app.get("/api/tables", async (c) => c.json(searchTables(readable(tables, await viewerOf(c)), c.req.query("q")).map((table) => ({ ...summarize(table), checks: checkCounts(table) }))));
  // A table you can't read is just a missing one.
  app.get("/api/tables/:owner/:slug", async (c) => {
    const table = tables.find((t) => t.owner === c.req.param("owner") && t.slug === c.req.param("slug"));
    return table && canRead(table, await viewerOf(c)) ? c.json(table) : c.json({ error: "No such table" }, 404);
  });
  blogRoutes(app, posts, tables, viewerOf);
  app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));
  dataRoutes(app, tables, publicUrl, auth?.sql);
  if (webDir && existsSync(join(resolve(webDir), "index.html"))) {
    const root = resolve(webDir);
    app.get("/assets/*", serveStatic({ root }));
    app.get("/logo.*", serveStatic({ root }));
    pageRoutes(app, tables, root, publicUrl, posts);
  }
  app.onError((error, c) => {
    console.error(`${c.req.method} ${c.req.path}: ${error.stack ?? error}`);
    return c.json({ error: "Something went wrong on our side." }, 500);
  });
  return app;
}
