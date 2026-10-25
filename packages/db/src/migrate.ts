import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

export const defaultMigrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));

/** Apply pending migrations. Safe to run on every boot. */
export async function runMigrations(url: string, migrationsFolder = defaultMigrationsFolder) {
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    await client.end();
  }
}
