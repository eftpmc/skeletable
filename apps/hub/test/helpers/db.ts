import { createHubDb, runHubMigrations } from "@skeleton/hub-db";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach } from "vitest";

export const HUB_TEST_URL = process.env.HUB_TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/hub_test";

/** The hub's test database, migrated once and emptied before each test (the reader list stays). */
export function useHubDb() {
  const handle = createHubDb(HUB_TEST_URL);
  beforeAll(async () => {
    await runHubMigrations(HUB_TEST_URL);
  });
  beforeEach(async () => {
    await handle.db.execute(sql`truncate source, contributor, job, catalog_build, benchmark restart identity cascade`);
  });
  afterAll(async () => {
    await handle.close();
  });
  return handle.db;
}
