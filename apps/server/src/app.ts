import type { Db } from "@closet/db";
import type { ServerInfo } from "@closet/shared";
import { serveStatic } from "@hono/node-server/serve-static";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { logger } from "hono/logger";
import type { Auth } from "./auth.js";
import type { Config } from "./config.js";

type Variables = {
  user: Auth["$Infer"]["Session"]["user"] | null;
};

export function createApp({ config, db, auth }: { config: Config; db: Db; auth: Auth }) {
  const app = new Hono<{ Variables: Variables }>();

  if (process.env.NODE_ENV !== "test") app.use(logger());

  app.use("/api/*", async (c, next) => {
    if (c.req.path.startsWith("/api/auth/")) return next();
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    c.set("user", session?.user ?? null);
    await next();
  });

  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

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

  app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

  if (config.WEB_DIST) {
    const root = config.WEB_DIST;
    app.use("/*", serveStatic({ root }));
    // Single-page app: unknown paths load index.html and the client router takes over.
    app.get("*", serveStatic({ root, path: "index.html" }));
  }

  return app;
}
