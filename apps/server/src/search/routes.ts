import { searchQuerySchema, intentFromParam } from "@closet/shared";
import { Hono } from "hono";
import { z } from "zod";
import { FetchError } from "../net/safe-fetch.js";
import { StoreUnavailableError } from "../catalog/connectors/storefront.js";
import type { AppEnv } from "../env.js";
import type { SourceInfo } from "@closet/shared";
import { NotFoundError, type SearchService } from "./service.js";
import type { StoreIcons } from "./store-icons.js";

export function searchRoutes(search: SearchService, sourceInfo: () => SourceInfo[], icons: StoreIcons) {
  const app = new Hono<AppEnv>();

  app.get("/search", async (c) => {
    const parsed = searchQuerySchema.safeParse(c.req.query());
    if (!parsed.success) return c.json({ error: "invalid_request", issues: parsed.error.issues }, 400);
    const { q, condition, max, mode } = parsed.data;
    const intent = intentFromParam(parsed.data.intent);
    if (parsed.data.intent !== undefined && !intent) return c.json({ error: "invalid_request" }, 400);
    return c.json(await search.search(q, { condition, maxPriceCents: max ? max * 100 : undefined, intent, mode }));
  });

  app.post("/search/link", async (c) => {
    const body = z.object({ url: z.string().trim().min(1).max(2000) }).safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "invalid_request" }, 400);
    const url = /^https?:\/\//i.test(body.data.url) ? body.data.url : `https://${body.data.url}`;
    try {
      return c.json({ productId: await search.resolveLink(url) });
    } catch (error) {
      if (error instanceof StoreUnavailableError) {
        return c.json({ error: "store_unavailable", state: error.observation.state, message: error.message }, 422);
      }
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

  app.get("/sources", (c) => c.json(sourceInfo()));

  // The store's own icon as a 64px PNG, for offer lists and the Buy menu.
  app.get("/store-icons/:domain", async (c) => {
    const domain = c.req.param("domain").toLowerCase();
    if (!/^[a-z0-9.-]+(:\d+)?$/.test(domain)) return c.json({ error: "not_found" }, 404);
    const icon = await icons.get(domain);
    if (!icon) return c.json({ error: "not_found" }, 404);
    return c.body(new Uint8Array(icon), 200, { "content-type": "image/png", "cache-control": "private, max-age=86400" });
  });

  return app;
}
