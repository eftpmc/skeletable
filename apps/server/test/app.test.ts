import { serverInfoSchema } from "@skeleton/shared";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { post, signUp, useTestApp } from "./helpers/setup.js";

const { setup } = useTestApp();

describe("public endpoints", () => {
  it("reports health", async () => {
    const response = await setup().request("/api/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("describes the server", async () => {
    const app = setup({ DEPLOYMENT: "cloud", SIGNUPS_ENABLED: "false" });
    await signUp(app);
    const info = serverInfoSchema.parse(await (await app.request("/api/info")).json());
    expect(info.deployment).toBe("cloud");
    expect(info.signupsEnabled).toBe(false);
    expect(info.publicSearch).toBe(true);
  });

  it("returns 401 for unknown api routes when signed out, 404 when signed in", async () => {
    const app = setup();
    expect((await app.request("/api/nope")).status).toBe(401);
    const user = await signUp(app);
    expect((await user.get("/api/nope")).status).toBe(404);
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

  it("blocks sign-up when signups are disabled, after the first account", async () => {
    const app = setup({ SIGNUPS_ENABLED: "false" });
    await signUp(app, "owner@example.com");
    const response = await app.request(post("/api/auth/sign-up/email", credentials));
    expect(response.ok).toBe(false);
  });
});

describe("config", () => {
  it("fails fast with a readable message", () => {
    expect(() => loadConfig({ DATABASE_URL: "nope" })).toThrow(/Invalid configuration/);
  });
});
