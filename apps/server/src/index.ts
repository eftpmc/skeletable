import { createDb, runMigrations } from "@skeleton/db";
import { serve } from "@hono/node-server";
import { startAlertsScheduler } from "./alerts/scheduler.js";
import { createApp, createServices } from "./app.js";
import { importPackIfNew } from "./catalog/pack.js";
import { createAuth } from "./auth.js";
import { loadConfig } from "./config.js";
import { DiskStorage } from "./storage.js";

const config = loadConfig();

await runMigrations(config.DATABASE_URL, config.MIGRATIONS_DIR);

const { db, close } = createDb(config.DATABASE_URL);
const auth = createAuth(config, db);
const storage = new DiskStorage(config.DATA_DIR);
const deps = { config, db, auth, storage };
const services = createServices(deps);
// Search the stores the owner added on the admin page from the first request on.
await services.stores.load();
const app = createApp(deps, services);
const stopAlerts = config.ALERTS_INTERVAL_MINUTES > 0 ? startAlertsScheduler(services.alerts, services.notify, config.ALERTS_INTERVAL_MINUTES) : () => {};

const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(`${config.SERVER_NAME} listening on http://localhost:${info.port} (${config.DEPLOYMENT})`);
});

// In the background: the app serves while a new catalog pack loads, then the search index catches up
// (rebuilt after an import, or when it's missing or out of step with the database).
void (async () => {
  if (config.CATALOG_PACK) {
    try {
      const result = await importPackIfNew(db, config.CATALOG_PACK, config.CATALOG_PACK_SHA256);
      console.log("catalog pack", result.imported ? "imported" : "already imported", result);
      if (result.imported) return console.log("catalog search index rebuilt:", await services.catalog.reindex(), "products");
    } catch (error) {
      console.error("catalog pack import failed:", error);
    }
  }
  const rebuilt = await services.catalog.ensureIndexed();
  console.log("catalog search index", rebuilt === null ? "up to date" : `rebuilt: ${rebuilt} products`);
})().catch((error) => console.error("catalog search index failed:", error));

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopAlerts();
    server.close();
    void close().finally(() => process.exit(0));
  });
}
