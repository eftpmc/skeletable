import {
  brandFitInputSchema,
  categorySchema,
  colorSchema,
  itemInputSchema,
  itemPatchSchema,
} from "@closet/shared";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { AuthedEnv, Deps } from "../env.js";
import { FetchError, safeFetch } from "@closet/readers";
import { StoreUnavailableError } from "@closet/readers";
import { exportUserData } from "./export.js";
import { InvalidImageError, MAX_UPLOAD_BYTES } from "./images.js";
import { fetchLinkPreview } from "./link-preview.js";
import * as service from "./service.js";

const dateSchema = z.object({ date: z.iso.date().optional() });

export function closetRoutes({ config, db, storage }: Deps) {
  const fetchOptions = { allowPrivate: config.ALLOW_PRIVATE_FETCH };
  const downloadImage = async (url: string) => {
    const response = await safeFetch(url, { ...fetchOptions, accept: "image/*", maxBytes: MAX_UPLOAD_BYTES });
    return response.body;
  };

  const app = new Hono<AuthedEnv>();

  app.onError((error, c) => {
    if (error instanceof service.NotFoundError) return c.json({ error: "not_found" }, 404);
    if (error instanceof InvalidImageError) return c.json({ error: "invalid_image", message: error.message }, 422);
    if (error instanceof ValidationError) return c.json({ error: "invalid_request", issues: error.issues }, 400);
    console.error(error);
    return c.json({ error: "internal_error" }, 500);
  });

  // Link import

  app.post("/import/preview", async (c) => {
    const { url } = await parseBody(c, z.object({ url: z.string().trim().min(1).max(2000) }));
    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    try {
      return c.json(await fetchLinkPreview(normalized, fetchOptions));
    } catch (error) {
      if (error instanceof StoreUnavailableError) {
        return c.json({ error: "store_unavailable", state: error.observation.state, message: error.message }, 422);
      }
      if (error instanceof FetchError) {
        const message =
          error.code === "invalid_url" || error.code === "blocked"
            ? "That doesn't look like a store link."
            : "We couldn't read that page. Try another link or add it with a photo.";
        return c.json({ error: error.code, message }, 422);
      }
      throw error;
    }
  });

  // Media

  app.post("/media", bodyLimit({ maxSize: MAX_UPLOAD_BYTES + 64 * 1024, onError: (c) => c.json({ error: "too_large" }, 413) }), async (c) => {
    const form = await c.req.parseBody();
    const file = form.file;
    if (!(file instanceof File)) return c.json({ error: "invalid_request", message: "Missing file" }, 400);
    const saved = await service.saveMedia(db, storage, c.get("user").id, Buffer.from(await file.arrayBuffer()));
    return c.json(saved, 201);
  });

  app.get("/media/:id/:variant", async (c) => {
    const { id, variant } = c.req.param();
    if (!z.uuid().safeParse(id).success || (variant !== "full" && variant !== "thumb")) {
      return c.json({ error: "not_found" }, 404);
    }
    const [row] = await db.query.media.findMany({
      where: (media, { and, eq }) => and(eq(media.id, id), eq(media.userId, c.get("user").id)),
      limit: 1,
    });
    if (!row) return c.json({ error: "not_found" }, 404);
    const data = await storage.get(service.mediaKey(id, variant));
    if (!data) return c.json({ error: "not_found" }, 404);
    return c.body(new Uint8Array(data), 200, {
      "content-type": "image/webp",
      "cache-control": "private, max-age=31536000, immutable",
    });
  });

  // Items

  app.get("/items", async (c) => {
    const filters = z
      .object({ category: categorySchema.optional(), color: colorSchema.optional(), q: z.string().max(200).optional() })
      .safeParse(c.req.query());
    if (!filters.success) return c.json({ error: "invalid_request", issues: filters.error.issues }, 400);
    return c.json(await service.listItems(db, c.get("user").id, filters.data));
  });

  app.post("/items", async (c) => {
    const input = await parseBody(c, itemInputSchema);
    const created = await service.createItem(db, storage, c.get("user").id, input, downloadImage);
    return c.json(created, 201);
  });

  app.get("/items/:id", async (c) => c.json(await service.getItem(db, c.get("user").id, itemId(c))));

  app.patch("/items/:id", async (c) => {
    const patch = await parseBody(c, itemPatchSchema);
    return c.json(await service.updateItem(db, storage, c.get("user").id, itemId(c), patch));
  });

  app.delete("/items/:id", async (c) => {
    await service.deleteItem(db, storage, c.get("user").id, itemId(c));
    return c.body(null, 204);
  });

  // Wear logging

  app.get("/items/:id/wears", async (c) => c.json(await service.listWears(db, c.get("user").id, itemId(c))));

  app.post("/items/:id/wears", async (c) => {
    const { date } = await parseBody(c, dateSchema);
    return c.json(await service.logWear(db, c.get("user").id, itemId(c), date ?? today()));
  });

  app.delete("/items/:id/wears/:date", async (c) => {
    const date = z.iso.date().safeParse(c.req.param("date"));
    if (!date.success) return c.json({ error: "invalid_request" }, 400);
    return c.json(await service.unlogWear(db, c.get("user").id, itemId(c), date.data));
  });

  // Brands and fit

  app.get("/brands", async (c) => c.json(await service.listUserBrands(db, c.get("user").id)));

  app.get("/brand-fits", async (c) => c.json(await service.listBrandFits(db, c.get("user").id)));

  app.put("/brand-fits", async (c) => {
    const fit = await parseBody(c, brandFitInputSchema);
    return c.json(await service.upsertBrandFit(db, c.get("user").id, fit));
  });

  app.delete("/brand-fits/:brand", async (c) =>
    c.json(await service.deleteBrandFit(db, c.get("user").id, c.req.param("brand"))),
  );

  // Export

  app.get("/export", async (c) => {
    const zip = await exportUserData(db, storage, c.get("user"));
    const stamp = new Date().toISOString().slice(0, 10);
    return c.body(zip as Uint8Array<ArrayBuffer>, 200, {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="closet-export-${stamp}.zip"`,
    });
  });

  return app;
}

class ValidationError extends Error {
  constructor(readonly issues: z.core.$ZodIssue[]) {
    super("Invalid request");
  }
}

async function parseBody<T extends z.ZodType>(c: Context, schema: T): Promise<z.output<T>> {
  let body: unknown = {};
  const text = await c.req.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new ValidationError([]);
    }
  }
  const result = schema.safeParse(body);
  if (!result.success) throw new ValidationError(result.error.issues);
  return result.data;
}

function itemId(c: Context) {
  const id = c.req.param("id");
  if (!id || !z.uuid().safeParse(id).success) throw new service.NotFoundError();
  return id;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
