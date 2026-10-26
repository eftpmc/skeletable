import { searchQuerySchema } from "@closet/shared";
import { Hono } from "hono";
import { z } from "zod";
import { FetchError } from "../net/safe-fetch.js";
import type { AuthedEnv } from "../env.js";
import type { SourceInfo } from "@closet/shared";
import { NotFoundError, type SearchService } from "./service.js";

export function searchRoutes(search: SearchService, sourceInfo: SourceInfo[]) {
  const app = new Hono<AuthedEnv>();

  app.get("/search", async (c) => {
    const parsed = searchQuerySchema.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: "invalid_request", issues: parsed.error.issues }, 400);
    const { q, condition, max } = parsed.data;
    return c.json(await search.search(q, { condition, maxPriceCents: max ? max * 100 : undefined }));
  });

  app.post("/search/link", async (c) => {
    const body = z.object({ url: z.string().trim().min(1).max(2000) }).safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "invalid_request" }, 400);
    const url = /^https?:\/\//i.test(body.data.url) ? body.data.url : `https://${body.data.url}`;
    try {
      return c.json({ productId: await search.resolveLink(url) });
    } catch (error) {
      if (error instanceof FetchError || error instanceof NotFoundError) {
        return c.json({ error: "unreadable", message: "We couldn't find a product on that page." }, 422);
      }
      throw error;
    }
  });

  app.get("/products/:id", async (c) => {
    const id = c.req.param("id");
    if (!z.uuid().safeParse(id).success) return c.json({ error: "not_found" }, 404);
    try {
      return c.json(await search.product(id));
    } catch (error) {
      if (error instanceof NotFoundError) return c.json({ error: "not_found" }, 404);
      throw error;
    }
  });

  app.get("/sources", (c) => c.json(sourceInfo));

  return app;
}
