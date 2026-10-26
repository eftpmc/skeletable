import { voteInputSchema } from "@closet/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { AuthedEnv } from "../env.js";
import { type CatalogService, NotFoundError } from "./service.js";

const idSchema = z.uuid();
const searchSchema = z.string().trim().min(1).max(100);

export function catalogRoutes(catalog: CatalogService) {
  const app = new Hono<AuthedEnv>();

  app.onError((error, c) => {
    if (error instanceof NotFoundError) return c.json({ error: "not_found" }, 404);
    throw error;
  });

  app.get("/catalog/brands", async (c) => {
    const q = searchSchema.safeParse(c.req.query("q"));
    if (!q.success) return c.json([]);
    return c.json(await catalog.search(c.get("user").id, q.data));
  });

  app.get("/catalog/brands/:id", async (c) => {
    const id = c.req.param("id");
    if (!idSchema.safeParse(id).success) return c.json({ error: "not_found" }, 404);
    return c.json(await catalog.detail(c.get("user").id, id));
  });

  app.put("/catalog/brands/:id/vote", async (c) => {
    const id = c.req.param("id");
    if (!idSchema.safeParse(id).success) return c.json({ error: "not_found" }, 404);
    const body = voteInputSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "invalid_request", issues: body.error.issues }, 400);
    await catalog.vote(c.get("user").id, id, body.data.verdict, body.data.context);
    return c.body(null, 204);
  });

  app.get("/catalog/for-you", async (c) => c.json(await catalog.forYou(c.get("user").id)));

  app.get("/catalog/starters", async (c) => c.json(await catalog.starters(c.get("user").id)));

  return app;
}
