import type { ServerInfo } from "@closet/shared";
import { serveStatic } from "@hono/node-server/serve-static";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { hasAccounts } from "./auth.js";
import { clientIp, withClientIp } from "./client-ip.js";
import { alertsRoutes } from "./alerts/routes.js";
import { AlertsService } from "./alerts/service.js";
import { catalogRoutes } from "./catalog/routes.js";
import { CatalogService } from "./catalog/service.js";
import { closetRoutes } from "./closet/routes.js";
import { RateLimiter } from "./rate-limit.js";
import { searchRoutes } from "./search/routes.js";
import { SearchService } from "./search/service.js";
import { sourcesFromConfig } from "./search/sources/index.js";
import { StoreIcons } from "./search/store-icons.js";
import type { AppEnv, AuthedEnv, Deps } from "./env.js";

/** The services behind the routes, shared with background jobs (the alerts scheduler). */
export function createServices(deps: Deps) {
  const { config, db } = deps;
  const { sources, info: sourceInfo } = deps.sources ?? sourcesFromConfig(config);
  const search = new SearchService(db, sources, { allowPrivate: config.ALLOW_PRIVATE_FETCH });
  const icons = new StoreIcons(db, deps.storage, {
    protocol: config.SHOPIFY_PROTOCOL,
    allowPrivate: config.ALLOW_PRIVATE_FETCH,
    fallback: config.STORE_ICON_FALLBACK,
  });
  return { search, sourceInfo, icons, alerts: new AlertsService(db, search), catalog: new CatalogService(db) };
}

export type Services = ReturnType<typeof createServices>;

export function createApp(deps: Deps, services: Services = createServices(deps)) {
  const { config, db, auth } = deps;
  const { search, sourceInfo, icons, alerts, catalog } = services;
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

  app.get("/api/info", async (c) => {
    // With sign-ups closed, the first account sets the server up. With them open, there's nothing to set up.
    const needsSetup = !config.SIGNUPS_ENABLED && !(await hasAccounts(db));
    const info: ServerInfo = {
      name: config.SERVER_NAME,
      version: config.APP_VERSION,
      deployment: config.DEPLOYMENT,
      signupsEnabled: config.SIGNUPS_ENABLED || needsSetup,
      needsSetup,
      publicSearch: config.PUBLIC_SEARCH,
    };
    return c.json(info);
  });

  app.get("/api/me", (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "unauthorized" }, 401);
    return c.json({ id: user.id, name: user.name, email: user.email, image: user.image ?? null });
  });

  // Searching and reading products, open to signed-out visitors when PUBLIC_SEARCH is on. Their
  // searches spend source API quota and their links make the server fetch pages, so each address
  // gets a limited share; signed-in users aren't limited.
  if (config.PUBLIC_SEARCH) {
    const limits = { search: new RateLimiter(30, 60_000), link: new RateLimiter(6, 60_000) };
    app.use("/api/search/*", async (c, next) => {
      if (c.get("user")) return next();
      const limiter = c.req.path === "/api/search/link" ? limits.link : limits.search;
      const wait = limiter.take(clientIp(c, config.TRUST_PROXY) ?? "unknown");
      if (wait === null) return next();
      c.header("retry-after", String(wait));
      return c.json({ error: "rate_limited", message: "Too many searches. Sign in, or try again in a minute." }, 429);
    });
    app.route("/api", searchRoutes(search, sourceInfo, icons));
  }

  // Everything below requires a signed-in user.
  const authed = new Hono<AuthedEnv>();
  authed.use(async (c, next) => {
    if (!c.get("user")) return c.json({ error: "unauthorized" }, 401);
    await next();
  });
  if (!config.PUBLIC_SEARCH) authed.route("/", searchRoutes(search, sourceInfo, icons));
  authed.route("/", closetRoutes(deps));
  authed.route("/", alertsRoutes(alerts));
  authed.route("/", catalogRoutes(catalog));
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
