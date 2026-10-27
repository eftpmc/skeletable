import { createDb, runMigrations } from "@closet/db";
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

// In the background: the app serves while a new catalog pack loads.
if (config.CATALOG_PACK) {
  importPackIfNew(db, config.CATALOG_PACK).then(
    (result) => console.log("catalog pack", result.imported ? "imported" : "already imported", result),
    (error) => console.error("catalog pack import failed:", error),
  );
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopAlerts();
    server.close();
    void close().finally(() => process.exit(0));
  });
}
