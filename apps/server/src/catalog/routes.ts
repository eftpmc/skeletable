import { catalogCategorySchema, categoryGroupSchema, seenInputSchema, voteInputSchema } from "@closet/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { AuthedEnv } from "../env.js";
import { type CatalogService, NotFoundError } from "./service.js";

const idSchema = z.uuid();
const searchSchema = z.string().trim().min(1).max(100);

/** Turning a catalog item into a tracked product: read its page, then track its price. */
export type SaveItem = { readLink: (url: string) => Promise<string>; track: (userId: string, productId: string) => Promise<unknown> };

const pageSchema = z.coerce.number().int().min(0).max(1000).catch(0);
const seedSchema = z.string().trim().max(40).catch("");
const categoryParam = catalogCategorySchema.optional().catch(undefined);
const groupParam = categoryGroupSchema.optional().catch(undefined);

export function catalogRoutes(catalog: CatalogService, save: SaveItem) {
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

  // The brand page reports how long it was on screen when you leave it: Discover's quiet taste signal.
  app.post("/catalog/brands/:id/seen", async (c) => {
    const id = c.req.param("id");
    if (!idSchema.safeParse(id).success) return c.json({ error: "not_found" }, 404);
    const body = seenInputSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "invalid_request", issues: body.error.issues }, 400);
    await catalog.seen(c.get("user").id, id, body.data.dwellMs);
    return c.body(null, 204);
  });

  // Discover: a feed of catalog products, ranked by your taste: all of them, one group or one category. The seed
  // keeps one session's order stable.
  app.get("/catalog/feed", async (c) =>
    c.json(
      await catalog.feed(
        c.get("user").id,
        pageSchema.parse(c.req.query("page")),
        seedSchema.parse(c.req.query("seed")),
        categoryParam.parse(c.req.query("category")),
        groupParam.parse(c.req.query("group")),
      ),
    ),
  );

  app.get("/catalog/search", async (c) => {
    const q = searchSchema.safeParse(c.req.query("q"));
    if (!q.success) return c.json([]);
    return c.json(await catalog.searchItems(c.get("user").id, q.data));
  });

  app.get("/catalog/categories",async (c) => c.json(await catalog.categories(c.get("user").id)));

  app.get("/catalog/items/:id", async (c) => c.json(await catalog.item(c.get("user").id, c.req.param("id"))));

  // Time with a product open counts toward taste through the product's own look.
  app.post("/catalog/items/:id/seen", async (c) => {
    const body = seenInputSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "invalid_request", issues: body.error.issues }, 400);
    const item = await catalog.itemRef(c.req.param("id"));
    await catalog.seenItem(c.get("user").id, item.id, body.data.dwellMs);
    return c.body(null, 204);
  });

  // Saving reads the store's product page (like pasting its link), then tracks its price. A save is
  // the strongest signal of taste there is: it counts like a heart.
  app.post("/catalog/items/:id/save", async (c) => {
    const item = await catalog.itemRef(c.req.param("id"));
    let productId: string;
    try {
      productId = await save.readLink(item.productUrl);
    } catch {
      return c.json({ error: "unreadable", message: "We couldn't read this item's page right now. Try again in a bit." }, 422);
    }
    await save.track(c.get("user").id, productId);
    await catalog.seenItem(c.get("user").id, item.id, 0, true);
    return c.json({ productId });
  });

  app.get("/catalog/for-you", async (c) => c.json(await catalog.forYou(c.get("user").id)));

  app.get("/catalog/starters", async (c) => c.json(await catalog.starters(c.get("user").id)));

  return app;
}
