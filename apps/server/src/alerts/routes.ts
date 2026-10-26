import { notifySettingsInputSchema, savedSearchInputSchema, watchInputSchema } from "@closet/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { AuthedEnv } from "../env.js";
import { type NotifyService, NotifyError } from "./notify.js";
import { type AlertsService, NotFoundError } from "./service.js";

const idSchema = z.uuid();

export function alertsRoutes(alerts: AlertsService, notify: NotifyService) {
  const app = new Hono<AuthedEnv>();

  app.onError((error, c) => {
    if (error instanceof NotFoundError) return c.json({ error: "not_found" }, 404);
    if (error instanceof NotifyError) return c.json({ error: "invalid_request", message: error.message }, 400);
    throw error;
  });

  // Tracked products

  app.get("/watches", async (c) => c.json(await alerts.watches(c.get("user").id)));

  app.post("/watches", async (c) => {
    const body = watchInputSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "invalid_request", issues: body.error.issues }, 400);
    return c.json(await alerts.watch(c.get("user").id, body.data), 201);
  });

  app.delete("/watches/:productId", async (c) => {
    const productId = c.req.param("productId");
    if (!idSchema.safeParse(productId).success) return c.json({ error: "not_found" }, 404);
    await alerts.unwatch(c.get("user").id, productId);
    return c.body(null, 204);
  });

  // Saved searches

  app.get("/saved-searches", async (c) => c.json(await alerts.savedSearches(c.get("user").id)));

  app.post("/saved-searches", async (c) => {
    const body = savedSearchInputSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "invalid_request", issues: body.error.issues }, 400);
    return c.json(await alerts.saveSearch(c.get("user").id, body.data), 201);
  });

  app.delete("/saved-searches/:id", async (c) => {
    const id = c.req.param("id");
    if (!idSchema.safeParse(id).success) return c.json({ error: "not_found" }, 404);
    await alerts.deleteSearch(c.get("user").id, id);
    return c.body(null, 204);
  });

  app.post("/saved-searches/:id/viewed", async (c) => {
    const id = c.req.param("id");
    if (!idSchema.safeParse(id).success) return c.json({ error: "not_found" }, 404);
    await alerts.markSearchViewed(c.get("user").id, id);
    return c.body(null, 204);
  });

  // The feed

  app.get("/alerts", async (c) => c.json(await alerts.alerts(c.get("user").id)));

  app.get("/alerts/unread", async (c) => c.json({ unread: await alerts.unreadCount(c.get("user").id) }));

  app.post("/alerts/read", async (c) => {
    await alerts.markAllRead(c.get("user").id);
    return c.body(null, 204);
  });

  // Delivery outside the app

  app.get("/notifications", async (c) => c.json(await notify.settings(c.get("user").id)));

  app.put("/notifications", async (c) => {
    const body = notifySettingsInputSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "invalid_request", issues: body.error.issues }, 400);
    return c.json(await notify.saveSettings(c.get("user").id, body.data));
  });

  app.post("/notifications/test", async (c) => {
    const body = z.object({ channel: z.enum(["ntfy", "email"]) }).safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "invalid_request", issues: body.error.issues }, 400);
    try {
      await notify.sendTest(c.get("user").id, body.data.channel);
    } catch (error) {
      if (error instanceof NotifyError) throw error;
      console.error("test notification failed:", error);
      const message =
        body.data.channel === "ntfy" ? "Couldn't reach that ntfy server. Check the link." : "The email didn't send. Check the server's email settings.";
      return c.json({ error: "send_failed", message }, 502);
    }
    return c.body(null, 204);
  });

  return app;
}
