import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export { schema };
export { runHubMigrations } from "./migrate.js";

export function createHubDb(url: string) {
  const client = postgres(url, { max: 10 });
  const db = drizzle(client, { schema });
  return { db, close: () => client.end() };
}

export type HubDb = ReturnType<typeof createHubDb>["db"];
