import type { ReadingInput } from "@skeleton/formats";
import { schema } from "@skeleton/hub-db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { hubApi, issueToken } from "../src/api.js";
import { annotateByRules } from "../src/annotate/rules.js";
import { benchmarkItems, drawBenchmark, recordCheck, saveDrafts, scoreModel, settleByAgreement } from "../src/benchmark.js";
import { contributorId } from "../src/contributors.js";
import { storeReadings } from "../src/engine/store.js";
import { resolveListings } from "../src/resolve.js";
import { setRole } from "../src/roles.js";
import { useHubDb } from "./helpers/db.js";

const db = useHubDb();
const { benchmark, listingValue, source } = schema;

const item = (externalId: string, title: string): ReadingInput => ({
  externalId,
  url: `https://maker.example/products/${externalId}`,
  title,
  images: [{ url: `https://cdn.example/${externalId}.jpg` }],
});

async function catalog() {
  const [site] = await db.insert(source).values({ domain: "maker.example", status: "approved", readerId: "shopify" }).returning({ id: source.id });
  await storeReadings(db, site!.id, [item("1", "Wool Overcoat"), item("2", "Hana"), item("3", "Linen Towel"), item("4", "Field Jacket")], { crawlId: null, readAt: new Date() });
  await annotateByRules(db);
  await resolveListings(db);
}

const coat = { area: "clothing", category: "outerwear", department: null, audience: "adults" } as const;

describe("benchmarks", () => {
  it("sets aside the unplaced listings first, then random ones, without repeats", async () => {
    await catalog();
    expect(await drawBenchmark(db, "b1", { random: 1, unplaced: 5 })).toBe(3);
    // "Hana" and "Linen Towel" are the two the rules can't place; one random listing joins them.
    const titles = (await benchmarkItems(db, "b1")).map((i) => i.input.title);
    expect(titles).toHaveLength(3);
    expect(titles).toEqual(expect.arrayContaining(["Hana", "Linen Towel"]));
    expect(await drawBenchmark(db, "b1", { random: 10, unplaced: 10 })).toBe(1);
  });

  it("keeps drafts that fit and refuses ones that contradict themselves", async () => {
    await catalog();
    await drawBenchmark(db, "b1", { random: 4, unplaced: 0 });
    const [first, second] = await benchmarkItems(db, "b1");
    expect(await saveDrafts(db, "b1", [
      { listingId: first!.listingId, draft: coat },
      { listingId: second!.listingId, draft: { ...coat, area: "home" } },
    ])).toEqual({ saved: 1, invalid: 1 });
  });

  it("records a curator's check, which also corrects the catalog", async () => {
    await catalog();
    await drawBenchmark(db, "b1", { random: 4, unplaced: 0 });
    const towel = (await benchmarkItems(db, "b1")).find((i) => i.input.title === "Linen Towel")!;
    const zack = await contributorId(db, "zack", "person");
    await setRole(db, "zack", "curator");
    await recordCheck(db, "b1", towel.listingId, zack, { area: "home", category: "bath", department: null, audience: "adults" });
    const [row] = await db.select().from(benchmark).where(eq(benchmark.listingId, towel.listingId));
    expect(row).toMatchObject({ answer: { category: "bath" }, checkedById: zack });
    const values = await db.select({ field: listingValue.field, value: listingValue.value }).from(listingValue).where(eq(listingValue.listingId, towel.listingId));
    expect(Object.fromEntries(values.map((v) => [v.field, v.value]))).toMatchObject({ area: "home", category: "bath" });
    await expect(recordCheck(db, "b1", towel.listingId, zack, { ...coat, department: "women", area: "home" })).rejects.toThrow();
  });

  it("settles where two labellers agree, as the panel's answer, and returns the rest", async () => {
    await catalog();
    await drawBenchmark(db, "b1", { random: 4, unplaced: 0 });
    const items = await benchmarkItems(db, "b1");
    const panel = await contributorId(db, "teacher-panel", "agent");
    const a = items.map((i) => ({ listingId: i.listingId, draft: coat }));
    const b = items.map((i, n) => ({ listingId: i.listingId, draft: n === 0 ? { ...coat, category: "tailoring" } : coat }));
    const result = await settleByAgreement(db, "b1", panel, a, b);
    expect(result).toMatchObject({ agreed: 3, invalid: 0 });
    expect(result.disagreements).toEqual([{ listingId: items[0]!.listingId, a: coat, b: { ...coat, category: "tailoring" } }]);
    const notes = await db.select({ method: schema.listingAnnotation.method }).from(schema.listingAnnotation).where(eq(schema.listingAnnotation.contributorId, panel));
    expect(new Set(notes.map((n) => n.method))).toEqual(new Set(["agent"]));
  });

  it("scores a model against the checked answers, field by field", async () => {
    await catalog();
    await drawBenchmark(db, "b1", { random: 4, unplaced: 0 });
    const zack = await contributorId(db, "zack", "person");
    for (const i of await benchmarkItems(db, "b1")) {
      const answer = i.input.title === "Linen Towel" ? { area: "home", category: "bath", department: null, audience: "adults" } : coat;
      await recordCheck(db, "b1", i.listingId, zack, answer);
    }
    // A model that calls everything a coat.
    const fakeFetch: typeof fetch = async () =>
      Response.json({ message: { content: JSON.stringify({ ...coat, materials: [], colours: [], condition: null, origin: null, confidence: 0.9 }) } });
    const score = await scoreModel(db, "b1", { ollama: "http://localhost:11434", model: "everything-is-a-coat", fetch: fakeFetch });
    expect(score).toMatchObject({ checked: 4, failed: 0, accuracy: { area: 0.75, category: 0.75, department: 1 } });
    expect(score.misses.map((m) => m.field).sort()).toEqual(["area", "category"]);
    expect(score.byConfidence.find((c) => c.at === 0.9)).toMatchObject({ kept: 1, accuracy: { category: 0.75 } });
    expect(score.byConfidence.find((c) => c.at === 0.5)).toMatchObject({ kept: 1 });
  });

  it("serves the checking page and lets only curators check", async () => {
    await catalog();
    await drawBenchmark(db, "b1", { random: 4, unplaced: 0 });
    const api = hubApi(db);
    expect(await (await api.request("/review/b1")).text()).toContain("Check: b1");
    const [first] = await benchmarkItems(db, "b1");
    const put = (token: string) =>
      api.request(`/api/benchmark/b1/${first!.listingId}`, { method: "PUT", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(coat) });
    expect((await put(await issueToken(db, "gpu", "worker"))).status).toBe(403);
    const person = await issueToken(db, "zack", "person");
    expect((await put(person)).status).toBe(403);
    await setRole(db, "zack", "curator");
    expect((await put(person)).status).toBe(200);
    const listed = (await (await api.request("/api/benchmark/b1", { headers: { authorization: `Bearer ${person}` } })).json()) as { answer: unknown }[];
    expect(listed.filter((i) => i.answer)).toHaveLength(1);
  });
});
