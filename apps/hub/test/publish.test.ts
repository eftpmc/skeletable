import { randomBytes, createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { schema } from "@skeleton/hub-db";
import { afterEach, describe, expect, it } from "vitest";
import { hubApi } from "../src/api.js";
import { KEEP_PUBLISHED, publishBuild } from "../src/publish.js";
import { useHubDb } from "./helpers/db.js";

const db = useHubDb();
const { catalogBuild, catalogChunk } = schema;

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

/** A build row and a file of random bytes standing in for its catalog. */
async function build(size: number) {
  const dir = await mkdtemp(join(tmpdir(), "hub-publish-"));
  dirs.push(dir);
  const file = join(dir, "catalog.jsonl.gz");
  const bytes = randomBytes(size);
  await writeFile(file, bytes);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const [row] = await db.insert(catalogBuild).values({ formatVersion: 2, resolverVersion: 1, sha256, counts: { listings: 1 } }).returning({ id: catalogBuild.id });
  return { id: row!.id, file, bytes, sha256 };
}

describe("publishing the catalog", () => {
  it("serves nothing before a build is published", async () => {
    const api = hubApi(db);
    expect((await api.request("/catalog/latest.jsonl.gz")).status).toBe(404);
    expect((await api.request("/catalog/latest.jsonl.gz.sha256")).status).toBe(404);
  });

  it("serves the latest published build in pieces, with its hash, to anyone", async () => {
    const api = hubApi(db);
    const first = await build(10_000);
    expect(await publishBuild(db, first.id, first.file, 4096)).toEqual({ chunks: 3, bytes: 10_000 });
    const served = Buffer.from(await (await api.request("/catalog/latest.jsonl.gz")).arrayBuffer());
    expect(served.equals(first.bytes)).toBe(true);
    expect((await (await api.request("/catalog/latest.jsonl.gz.sha256")).text()).trim()).toBe(first.sha256);
    expect(await (await api.request("/catalog/latest.json")).json()).toMatchObject({ id: first.id, sha256: first.sha256, licence: "ODbL-1.0" });

    const second = await build(500);
    await publishBuild(db, second.id, second.file, 4096);
    expect((await (await api.request("/catalog/latest.jsonl.gz.sha256")).text()).trim()).toBe(second.sha256);
  });

  it("keeps the files of only the last few published builds", async () => {
    const builds = [];
    for (let i = 0; i < KEEP_PUBLISHED + 2; i++) {
      const b = await build(100);
      await publishBuild(db, b.id, b.file);
      builds.push(b);
    }
    const kept = new Set((await db.select({ buildId: catalogChunk.buildId }).from(catalogChunk)).map((c) => c.buildId));
    expect(kept).toEqual(new Set(builds.slice(-KEEP_PUBLISHED).map((b) => b.id)));
  });
});
