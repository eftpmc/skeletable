import type { ServerInfo } from "@closet/shared";
import { serveStatic } from "@hono/node-server/serve-static";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { clientIp, withClientIp } from "./client-ip.js";
import { closetRoutes } from "./closet/routes.js";
import { searchRoutes } from "./search/routes.js";
import { SearchService } from "./search/service.js";
import { sourcesFromConfig } from "./search/sources/index.js";
import { StoreIcons } from "./search/store-icons.js";
import type { AppEnv, AuthedEnv, Deps } from "./env.js";

export function createApp(deps: Deps) {
  const { config, db, auth } = deps;
  const { sources, info: sourceInfo } = deps.sources ?? sourcesFromConfig(config);
  const search = new SearchService(db, sources, { allowPrivate: config.ALLOW_PRIVATE_FETCH });
  const icons = new StoreIcons(db, deps.storage, {
    protocol: config.SHOPIFY_PROTOCOL,
    allowPrivate: config.ALLOW_PRIVATE_FETCH,
    fallback: config.STORE_ICON_FALLBACK,
  });
  const app = new Hono<AppEnv>();

  if (process.env.NODE_ENV !== "test") app.use(logger());

  app.use("/api/*", async (c, next) => {
    if (c.req.path.startsWith("/api/auth/")) return next();
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    c.set("user", session?.user ?? null);
    await next();
  });

  app.on(["GET", "POST"], "/api/auth/*", (c) =>
    auth.handler(withClientIp(c.req.raw, clientIp(c, config.TRUST_PROXY))),
  );

  app.get("/api/health", async (c) => {
    try {
      await db.execute(sql`select 1`);
      return c.json({ ok: true });
    } catch {
      return c.json({ ok: false }, 503);
    }
  });

  app.get("/api/info", (c) => {
    const info: ServerInfo = {
      name: config.SERVER_NAME,
      version: config.APP_VERSION,
      deployment: config.DEPLOYMENT,
      signupsEnabled: config.SIGNUPS_ENABLED,
    };
    return c.json(info);
  });

  app.get("/api/me", (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);
    return c.json({ id: user.id, name: user.name, email: user.email, image: user.image ?? null });
  });

  // Everything below requires a signed-in user.
  const authed = new Hono<AuthedEnv>();
  authed.use(async (c, next) => {
    if (!c.get("user")) return c.json({ error: "unauthorized" }, 401);
    await next();
  });
  authed.route("/", searchRoutes(search, sourceInfo, icons));
  authed.route("/", closetRoutes(deps));
  app.route("/api", authed);

  app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

  if (config.WEB_DIST) {
    const root = config.WEB_DIST;
    app.use("/*", serveStatic({ root }));
    // Single-page app: unknown paths load index.html and the client router takes over.
    app.get("*", serveStatic({ root, path: "index.html" }));
  }

  return app;
}
