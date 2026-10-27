import { type Db, schema } from "@closet/db";
import { type AdminOverview, type AdminUser, type Role, isAdmin, roleInputSchema } from "@closet/shared";
import { asc, count, eq } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { Hono } from "hono";
import { z } from "zod";
import type { Config } from "../config.js";
import type { AuthedEnv } from "../env.js";
import { StoreSetupError, type StoreSettings } from "./stores.js";

/** Running the server: the stores search uses, who has an account, and the server at a glance. Owners and admins only. */
export function adminRoutes({ config, db, stores, email }: { config: Config; db: Db; stores: StoreSettings; email: boolean }) {
  const app = new Hono<AuthedEnv>();

  app.use(async (c, next) => {
    if (!isAdmin(roleOf(c.get("user")))) return c.json({ error: "forbidden" }, 403);
    await next();
  });

  // A bad address or a store we can't read is the admin's to fix: say what's wrong.
  app.onError((error, c) => {
    if (error instanceof StoreSetupError) return c.json({ error: "invalid_store", message: error.message }, 422);
    if (error instanceof z.ZodError) return c.json({ error: "invalid_request", issues: error.issues }, 400);
    throw error;
  });

  app.get("/overview", async (c) => {
    const total = async (table: PgTable) => {
      const [row] = await db.select({ n: count() }).from(table);
      return row?.n ?? 0;
    };
    const overview: AdminOverview = {
      version: config.APP_VERSION,
      deployment: config.DEPLOYMENT,
      signupsEnabled: config.SIGNUPS_ENABLED,
      publicSearch: config.PUBLIC_SEARCH,
      email,
      counts: {
        users: await total(schema.user),
        products: await total(schema.product),
        offers: await total(schema.offer),
        savedSearches: await total(schema.savedSearch),
        watches: await total(schema.watch),
      },
    };
    return c.json(overview);
  });

  app.get("/stores", (c) => c.json(stores.view()));

  app.post("/stores/shopify", async (c) => {
    await stores.addShopify(await c.req.json(), c.get("user").id);
    return c.json(stores.view(), 201);
  });

  app.delete("/stores/shopify/:domain", async (c) => {
    await stores.removeShopify(c.req.param("domain"), c.get("user").id);
    return c.json(stores.view());
  });

  app.put("/stores/ebay", async (c) => {
    await stores.setEbay(await c.req.json(), c.get("user").id);
    return c.json(stores.view());
  });

  app.delete("/stores/ebay", async (c) => {
    await stores.clearEbay(c.get("user").id);
    return c.json(stores.view());
  });

  app.put("/stores/bestbuy", async (c) => {
    await stores.setBestBuy(await c.req.json(), c.get("user").id);
    return c.json(stores.view());
  });

  app.delete("/stores/bestbuy", async (c) => {
    await stores.clearBestBuy(c.get("user").id);
    return c.json(stores.view());
  });

  app.get("/users", async (c) => {
    const rows = await db
      .select({ id: schema.user.id, name: schema.user.name, email: schema.user.email, role: schema.user.role, createdAt: schema.user.createdAt })
      .from(schema.user)
      .orderBy(asc(schema.user.createdAt));
    const users: AdminUser[] = rows.map((u) => ({ ...u, role: u.role as Role, createdAt: u.createdAt.toISOString() }));
    return c.json(users);
  });

  // Only the owner hands out admin, and nobody changes the owner (there's always exactly one).
  app.patch("/users/:id", async (c) => {
    if (roleOf(c.get("user")) !== "owner") return c.json({ error: "forbidden", message: "Only the owner can change roles." }, 403);
    const { role } = roleInputSchema.parse(await c.req.json());
    const [target] = await db.select({ role: schema.user.role }).from(schema.user).where(eq(schema.user.id, c.req.param("id")));
    if (!target) return c.json({ error: "not_found" }, 404);
    if (target.role === "owner") return c.json({ error: "forbidden", message: "The owner's role can't be changed." }, 403);
    await db.update(schema.user).set({ role, updatedAt: new Date() }).where(eq(schema.user.id, c.req.param("id")));
    return c.json({ ok: true });
  });

  return app;
}

export const roleOf = (user: { role?: unknown } | null | undefined): Role =>
  user?.role === "owner" || user?.role === "admin" ? user.role : "member";
