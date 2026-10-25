import { createDb, runMigrations } from "@closet/db";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { createAuth } from "./auth.js";
import { loadConfig } from "./config.js";
import { DiskStorage } from "./storage.js";

const config = loadConfig();

await runMigrations(config.DATABASE_URL, config.MIGRATIONS_DIR);

const { db, close } = createDb(config.DATABASE_URL);
const auth = createAuth(config, db);
const storage = new DiskStorage(config.DATA_DIR);
const app = createApp({ config, db, auth, storage });

const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(`${config.SERVER_NAME} listening on http://localhost:${info.port} (${config.DEPLOYMENT})`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close();
    void close().finally(() => process.exit(0));
  });
}
