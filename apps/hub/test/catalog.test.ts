import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { catalogLineSchema, type ReadingInput } from "@skeleton/formats";
import { schema } from "@skeleton/hub-db";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { annotateByRules, RULES_VERSION } from "../src/annotate/rules.js";
import { buildCatalog } from "../src/build.js";
import { contributorId } from "../src/contributors.js";
import { storeReadings } from "../src/engine/store.js";
import { LAB_PHOTO_MODEL } from "../src/lab/import.js";
import { resolveListings, RESOLVER_VERSION } from "../src/resolve.js";
import { useHubDb } from "./helpers/db.js";

const db = useHubDb();
const { catalogBuild, embedding, listing, listingAnnotation, listingValue, source } = schema;

const item = (externalId: string, title: string, extra: Partial<ReadingInput> = {}): ReadingInput => ({
  externalId,
  url: `https://maker.example/products/${externalId}`,
  title,
  price: { amount: 12000, currency: "USD" },
  images: [{ url: `https://cdn.example/${externalId}.jpg`, width: 600, height: 800 }],
  ...extra,
});

async function site(domain: string, readings: ReadingInput[], status = "approved") {
  const [row] = await db.insert(source).values({ domain, status, readerId: "shopify" }).returning({ id: source.id });
  await storeReadings(db, row!.id, readings, { crawlId: null, readAt: new Date() });
  return row!.id;
}

const valuesOf = async (externalId: string) =>
  Object.fromEntries(
    (await db.select({ field: listingValue.field, value: listingValue.value }).from(listingValue).innerJoin(listing, eq(listing.id, listingValue.listingId)).where(eq(listing.externalId, externalId))).map(
      (r) => [r.field, r.value],
    ),
  );

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("rules and final values", () => {
  it("annotates listings from their words, once per reading", async () => {
    await site("maker.example", [
      item("1", "Wool Overcoat - Camel", { productType: "Outerwear" }),
      item("2", "Gift Card"),
      item("3", "Kids Puffer Jacket"),
      item("4", "Men's Oxford Shirt"),
    ]);
    const added = await annotateByRules(db);
    expect(added).toBeGreaterThan(0);
    expect(await annotateByRules(db)).toBe(0);
    await resolveListings(db);

    expect(await valuesOf("1")).toMatchObject({ category: "outerwear", area: "clothing", audience: "adults" });
    expect(await valuesOf("2")).toEqual({});
    expect(await valuesOf("3")).toMatchObject({ category: "outerwear", audience: "kids" });
    expect(await valuesOf("4")).toMatchObject({ category: "shirts", department: "men" });
  });

  it("gives a clearly one-sided site's unnamed listings its side", async () => {
    await site("womens.example", [
      ...["1", "2", "3", "4", "5"].map((id) => item(id, `Women's Linen Dress ${id}`)),
      item("6", "Linen Shirt"),
    ]);
    await annotateByRules(db);
    await resolveListings(db);
    expect(await valuesOf("6")).toMatchObject({ category: "shirts", department: "women" });
  });

  it("lets a person's correction beat the rules", async () => {
    await site("maker.example", [item("1", "Field Jacket")]);
    await annotateByRules(db);
    const [row] = await db.select({ id: listing.id }).from(listing);
    const zack = await contributorId(db, "zack", "person");
    await db.insert(listingAnnotation).values({ listingId: row!.id, field: "category", fieldVersion: 1, value: "shirts", method: "person", contributorId: zack });
    await resolveListings(db, [row!.id]);
    const [value] = await db.select().from(listingValue).where(eq(listingValue.field, "category"));
    expect(value).toMatchObject({ value: "shirts", resolverVersion: RESOLVER_VERSION });

    const rules = await db.select().from(listingAnnotation).where(eq(listingAnnotation.promptVersion, RULES_VERSION));
    expect(rules.length).toBeGreaterThan(0);
  });
});

describe("the catalog file", () => {
  it("carries approved sources' adult listings with a category, price and photo, and records the build", async () => {
    const approved = await site("maker.example", [
      item("1", "Wool Overcoat"),
      item("2", "Kids Overcoat"),
      item("3", "Linen Trousers", { price: undefined }),
      item("4", "Candle"),
    ]);
    await site("candidate.example", [item("5", "Wool Overcoat")], "candidate");
    await annotateByRules(db);
    await resolveListings(db);
    const [coat] = await db.select({ id: listing.id }).from(listing).where(eq(listing.externalId, "1"));
    await db.insert(embedding).values({ listingId: coat!.id, model: LAB_PHOTO_MODEL, kind: "photo", vector: [0.6, 0.8] });

    const dir = await mkdtemp(join(tmpdir(), "hub-build-"));
    dirs.push(dir);
    const file = join(dir, "catalog.jsonl.gz");
    const result = await buildCatalog(db, file);
    expect(result).toMatchObject({ sources: 1, listings: 1, skipped: { kids: 1, noPrice: 1, noCategory: 1 } });

    const bytes = await readFile(file);
    expect(result.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    const lines = gunzipSync(bytes).toString("utf8").trim().split("\n").map((l) => catalogLineSchema.parse(JSON.parse(l)));
    expect(lines.map((l) => l.type)).toEqual(["header", "source", "listing"]);
    expect(lines[0]).toMatchObject({ licence: "ODbL-1.0", buildId: result.buildId });
    expect(lines[1]).toMatchObject({ id: approved, domain: "maker.example" });
    expect(lines[2]).toMatchObject({ title: "Wool Overcoat", values: { category: "outerwear" }, price: { amount: 12000, currency: "USD" } });
    expect(Object.keys((lines[2] as { embeddings: Record<string, string> }).embeddings)).toEqual([LAB_PHOTO_MODEL]);

    const [build] = await db.select().from(catalogBuild);
    expect(build).toMatchObject({ id: result.buildId, sha256: result.sha256, resolverVersion: RESOLVER_VERSION });
  });
});
