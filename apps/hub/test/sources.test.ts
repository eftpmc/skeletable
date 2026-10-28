import { schema } from "@skeleton/hub-db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { hubApi, issueToken } from "../src/api.js";
import { setRole } from "../src/roles.js";
import { useHubDb } from "./helpers/db.js";

const db = useHubDb();
const { source } = schema;

describe("deciding on candidate sites", () => {
  it("lets curators list candidates and approve or reject them, and no one else", async () => {
    await db.insert(source).values([{ domain: "maker.example" }, { domain: "reseller.example" }, { domain: "known.example", status: "approved" }]);
    const api = hubApi(db);
    const token = await issueToken(db, "ana", "person");
    const call = (method: string, path: string, body?: unknown) =>
      api.request(path, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

    expect((await call("GET", "/api/sources/candidates")).status).toBe(403);
    await setRole(db, "ana", "curator");
    const waiting = (await (await call("GET", "/api/sources/candidates")).json()) as { id: string; domain: string }[];
    expect(waiting.map((w) => w.domain).sort()).toEqual(["maker.example", "reseller.example"]);

    const maker = waiting.find((w) => w.domain === "maker.example")!;
    const reseller = waiting.find((w) => w.domain === "reseller.example")!;
    expect(await (await call("POST", `/api/sources/${maker.id}/decision`, { approve: true })).json()).toMatchObject({ status: "approved" });
    expect(await (await call("POST", `/api/sources/${reseller.id}/decision`, { approve: false })).json()).toMatchObject({ status: "rejected" });
    // Decided once; a second call, or a made-up id, finds no candidate.
    expect((await call("POST", `/api/sources/${maker.id}/decision`, { approve: false })).status).toBe(404);
    expect((await call("POST", "/api/sources/nope/decision", { approve: true })).status).toBe(404);

    const [approved] = await db.select().from(source).where(eq(source.id, maker.id));
    expect(approved!.nextCrawlAt).not.toBeNull();
    expect(await (await call("GET", "/api/sources/candidates")).json()).toEqual([]);
  });

  it("serves the curators' page, which builds what contributors wrote as text", async () => {
    const page = await (await hubApi(db).request("/curate")).text();
    expect(page).toContain("<title>Curate</title>");
    expect(page).not.toContain("innerHTML");
  });
});
