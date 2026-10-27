import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDb, runMigrations } from "@closet/db";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach } from "vitest";
import { createApp, createServices } from "../../src/app.js";
import { createAuth } from "../../src/auth.js";
import { type Config, loadConfig } from "../../src/config.js";
import type { Deps } from "../../src/env.js";
import { CatalogIndex } from "../../src/catalog/search-index.js";
import { DiskStorage } from "../../src/storage.js";

export const DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/closet_test";
export const PUBLIC_URL = "http://localhost:3000";
export const MEILI_URL = process.env.TEST_MEILI_URL ?? "http://localhost:7700";
export const MEILI_MASTER_KEY = process.env.TEST_MEILI_MASTER_KEY ?? "test-master-key-0123456789";
// Each test process gets its own search index, removed when it's done.
const MEILI_INDEX = `test_catalog_${process.pid}`;

/** A real app on the test database, with a fresh temp folder for files. Resets tables before each test. */
export function useTestApp() {
  const { db, close } = createDb(DATABASE_URL);
  const dataDir = mkdtempSync(path.join(tmpdir(), "closet-test-"));
  const storage = new DiskStorage(dataDir);

  beforeAll(async () => {
    await runMigrations(DATABASE_URL);
  });

  beforeEach(async () => {
    await db.execute(sql`truncate table "user", "brand", "store", "product" cascade`);
  });

  afterAll(async () => {
    await new CatalogIndex(MEILI_URL, MEILI_MASTER_KEY, MEILI_INDEX).drop();
    await close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  function setup(overrides: Partial<Record<string, string>> = {}, extra: Partial<Pick<Deps, "sources" | "mailer">> = {}) {
    return setupWithServices(overrides, extra).app;
  }

  /** Same as setup, plus the services behind it (to run scheduled jobs in tests). */
  function setupWithServices(overrides: Partial<Record<string, string>> = {}, extra: Partial<Pick<Deps, "sources" | "mailer">> = {}) {
    const config: Config = loadConfig({
      DATABASE_URL,
      PUBLIC_URL,
      AUTH_SECRET: "test-secret-that-is-at-least-32-characters-long",
      DATA_DIR: dataDir,
      // Most tests sign up more than one person; the closed-by-default behavior has its own tests.
      SIGNUPS_ENABLED: "true",
      MEILI_URL,
      MEILI_MASTER_KEY,
      MEILI_INDEX,
      ...overrides,
    });
    const deps: Deps = { config, db, auth: createAuth(config, db), storage, ...extra };
    const services = createServices(deps);
    return { app: createApp(deps, services), services };
  }

  return { db, storage, dataDir, setup, setupWithServices };
}

export type TestApp = ReturnType<ReturnType<typeof useTestApp>["setup"]>;

export function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${PUBLIC_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: PUBLIC_URL, ...headers },
    body: JSON.stringify(body),
  });
}

/** Sign up a user and return a client that sends their session cookie. */
export async function signUp(app: TestApp, email = "zack@example.com") {
  const response = await app.request(post("/api/auth/sign-up/email", { name: "Zack", email, password: "correct-horse" }));
  if (response.status !== 200) throw new Error(`sign-up failed: ${response.status}`);
  const cookie = response.headers.get("set-cookie")!.split(";")[0]!;
  const send = (method: string, path: string, body?: unknown) =>
    app.request(`${PUBLIC_URL}${path}`, {
      method,
      headers: {
        cookie,
        origin: PUBLIC_URL,
        ...(body !== undefined && !(body instanceof FormData) ? { "content-type": "application/json" } : {}),
      },
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
  return {
    cookie,
    get: (path: string) => send("GET", path),
    post: (path: string, body?: unknown) => send("POST", path, body ?? {}),
    patch: (path: string, body: unknown) => send("PATCH", path, body),
    put: (path: string, body: unknown) => send("PUT", path, body),
    delete: (path: string) => send("DELETE", path),
    upload: (data: Buffer, name = "photo.jpg") => {
      const form = new FormData();
      form.append("file", new File([new Uint8Array(data)], name));
      return send("POST", "/api/media", form);
    },
  };
}
