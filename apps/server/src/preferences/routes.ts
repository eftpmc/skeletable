import type { Db } from "@skeleton/db";
import { preferencesInputSchema } from "@skeleton/shared";
import { Hono } from "hono";
import type { AuthedEnv } from "../env.js";
import { readPreferences, updatePreferences } from "./service.js";

/** What someone wants to see in Discover: their side of the catalog, a price cap, categories to hide. */
export function preferencesRoutes(db: Db) {
  const app = new Hono<AuthedEnv>();

  app.get("/preferences", async (c) => c.json(await readPreferences(db, c.get("user").id)));

  app.patch("/preferences", async (c) => {
    const body = preferencesInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid_request", issues: body.error.issues }, 400);
    const prefs = await updatePreferences(db, c.get("user").id, body.data);
    return c.json(prefs);
  });

  return app;
}
