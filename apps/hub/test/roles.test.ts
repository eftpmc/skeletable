import { schema } from "@skeleton/hub-db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { hubApi, issueToken } from "../src/api.js";
import { setRole } from "../src/roles.js";
import { useHubDb } from "./helpers/db.js";

const db = useHubDb();

const call = (api: ReturnType<typeof hubApi>, token: string, method: string, path: string, body?: unknown) =>
  api.request(path, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

const note = "I buy from small makers and can check clothing and home listings.";

describe("roles", () => {
  it("lets a person apply to curate, once at a time, and the owner decide", async () => {
    const api = hubApi(db);
    const ana = await issueToken(db, "ana", "person");
    const gpu = await issueToken(db, "gpu", "worker");
    const owner = await issueToken(db, "zack", "person");
    await setRole(db, "zack", "owner");

    expect((await call(api, gpu, "POST", "/api/applications", { role: "curator", note })).status).toBe(403);
    expect((await call(api, ana, "POST", "/api/applications", { role: "curator", note: "pls" })).status).toBe(422);
    const applied = await call(api, ana, "POST", "/api/applications", { role: "curator", note });
    expect(applied.status).toBe(200);
    expect((await call(api, ana, "POST", "/api/applications", { role: "curator", note })).status).toBe(409);

    // Only the owner sees and decides requests.
    expect((await call(api, ana, "GET", "/api/applications")).status).toBe(403);
    const waiting = (await (await call(api, owner, "GET", "/api/applications")).json()) as { id: string; handle: string }[];
    expect(waiting.map((w) => w.handle)).toEqual(["ana"]);
    expect((await call(api, ana, "POST", `/api/applications/${waiting[0]!.id}/decision`, { approve: true })).status).toBe(403);
    expect((await call(api, owner, "POST", "/api/applications/not-an-id/decision", { approve: true })).status).toBe(404);
    expect((await call(api, owner, "POST", `/api/applications/${waiting[0]!.id}/decision`, { approve: true })).status).toBe(200);
    expect((await call(api, owner, "POST", `/api/applications/${waiting[0]!.id}/decision`, { approve: true })).status).toBe(404);

    expect(await (await call(api, ana, "GET", "/api/me")).json()).toMatchObject({ handle: "ana", kind: "person", role: "curator" });
    const [row] = await db.select({ status: schema.application.status }).from(schema.application).where(eq(schema.application.id, waiting[0]!.id));
    expect(row!.status).toBe("approved");
  });

  it("leaves a declined person a contributor, free to ask again", async () => {
    const api = hubApi(db);
    const ana = await issueToken(db, "ana", "person");
    const owner = await issueToken(db, "zack", "person");
    await setRole(db, "zack", "owner");
    await call(api, ana, "POST", "/api/applications", { role: "curator", note });
    const [waiting] = (await (await call(api, owner, "GET", "/api/applications")).json()) as { id: string }[];
    await call(api, owner, "POST", `/api/applications/${waiting!.id}/decision`, { approve: false });
    expect(await (await call(api, ana, "GET", "/api/me")).json()).toMatchObject({ role: "contributor" });
    expect((await call(api, ana, "POST", "/api/applications", { role: "curator", note })).status).toBe(200);
  });
});
