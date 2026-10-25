import { createDb, runMigrations } from "@closet/db";
import { serverInfoSchema } from "@closet/shared";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createAuth } from "../src/auth.js";
import { type Config, loadConfig } from "../src/config.js";

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/closet_test";
const PUBLIC_URL = "http://localhost:3000";

const { db, close } = createDb(DATABASE_URL);

function setup(overrides: Partial<Record<string, string>> = {}) {
  const config: Config = loadConfig({
    DATABASE_URL,
    PUBLIC_URL,
    AUTH_SECRET: "test-secret-that-is-at-least-32-characters-long",
    ...overrides,
  });
  return createApp({ config, db, auth: createAuth(config, db) });
}

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${PUBLIC_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: PUBLIC_URL, ...headers },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  await runMigrations(DATABASE_URL);
});

beforeEach(async () => {
  await db.execute(sql`truncate table "user" cascade`);
});

afterAll(async () => {
  await close();
});

describe("public endpoints", () => {
  it("reports health", async () => {
    const response = await setup().request("/api/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("describes the server", async () => {
    const response = await setup({ DEPLOYMENT: "cloud", SIGNUPS_ENABLED: "false" }).request("/api/info");
    const info = serverInfoSchema.parse(await response.json());
    expect(info.deployment).toBe("cloud");
    expect(info.signupsEnabled).toBe(false);
  });

  it("returns 404 json for unknown api routes", async () => {
    const response = await setup().request("/api/nope");
    expect(response.status).toBe(404);
  });
});

describe("accounts", () => {
  const credentials = { name: "Zack", email: "zack@example.com", password: "correct-horse" };

  it("rejects /api/me without a session", async () => {
    const response = await setup().request("/api/me");
    expect(response.status).toBe(401);
  });

  it("signs up, then reads the current user with the session cookie", async () => {
    const app = setup();
    const signUp = await app.request(post("/api/auth/sign-up/email", credentials));
    expect(signUp.status).toBe(200);

    const cookie = signUp.headers.get("set-cookie");
    expect(cookie).toBeTruthy();

    const me = await app.request("/api/me", { headers: { cookie: cookie! } });
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ name: "Zack", email: "zack@example.com" });
  });

  it("signs in with an existing account", async () => {
    const app = setup();
    await app.request(post("/api/auth/sign-up/email", credentials));
    const signIn = await app.request(
      post("/api/auth/sign-in/email", { email: credentials.email, password: credentials.password }),
    );
    expect(signIn.status).toBe(200);

    const wrong = await app.request(post("/api/auth/sign-in/email", { email: credentials.email, password: "nope-nope" }));
    expect(wrong.status).toBe(401);
  });

  it("blocks sign-up when signups are disabled", async () => {
    const response = await setup({ SIGNUPS_ENABLED: "false" }).request(post("/api/auth/sign-up/email", credentials));
    expect(response.ok).toBe(false);
  });
});

describe("config", () => {
  it("fails fast with a readable message", () => {
    expect(() => loadConfig({ DATABASE_URL: "nope" })).toThrow(/Invalid configuration/);
  });
});
