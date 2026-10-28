import type { ReadingInput } from "@skeleton/formats";
import { schema } from "@skeleton/hub-db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { hubApi, issueToken } from "../src/api.js";
import { contributorId } from "../src/contributors.js";
import { storeReadings } from "../src/engine/store.js";
import { claimJob, JobError, queueExtractFacts, submitAnswer } from "../src/jobs.js";
import { runWorker } from "../src/worker.js";
import { useHubDb } from "./helpers/db.js";

const db = useHubDb();
const { assignment, job, listingAnnotation, listingValue, source } = schema;

const item = (externalId: string, title: string): ReadingInput => ({
  externalId,
  url: `https://maker.example/products/${externalId}`,
  title,
  description: "A field coat in waxed cotton, made in England.",
  images: [{ url: `https://cdn.example/${externalId}.jpg` }],
});

const answer = {
  area: "clothing", category: "outerwear", department: null, materials: ["waxed cotton"], colours: [],
  condition: "new", origin: "GB", confidence: 0.8,
};

async function listings(...titles: string[]) {
  const [site] = await db.insert(source).values({ domain: "maker.example", status: "approved", readerId: "shopify" }).returning({ id: source.id });
  await storeReadings(db, site!.id, titles.map((t, i) => item(String(i + 1), t)), { crawlId: null, readAt: new Date() });
}

describe("the job queue", () => {
  it("queues listings without a category once, and hands each to one contributor", async () => {
    await listings("Hunter", "Ranger");
    expect(await queueExtractFacts(db)).toBe(2);
    expect(await queueExtractFacts(db)).toBe(0);
    const [queued] = await db.select().from(job).limit(1);
    expect(queued).toMatchObject({ kind: "extract-facts", level: 1, input: { title: expect.any(String), tags: [] } });

    const a = await contributorId(db, "a", "worker");
    const b = await contributorId(db, "b", "worker");
    const claims = await Promise.all([claimJob(db, a), claimJob(db, b)]);
    expect(new Set(claims.map((c) => c?.jobId)).size).toBe(2);
    expect(await claimJob(db, a, { kinds: ["extract-facts"] })).toBeNull();
  });

  it("refuses an answer that doesn't fit, then settles a good one into annotations and final values", async () => {
    await listings("Hunter");
    await queueExtractFacts(db);
    const worker = await contributorId(db, "gpu-1", "worker");
    const claimed = (await claimJob(db, worker))!;

    await expect(submitAnswer(db, claimed.assignmentId, worker, { answer: { ...answer, category: "coats" } })).rejects.toBeInstanceOf(JobError);
    const someoneElse = await contributorId(db, "other", "worker");
    await expect(submitAnswer(db, claimed.assignmentId, someoneElse, { answer })).rejects.toMatchObject({ status: 404 });

    expect(await submitAnswer(db, claimed.assignmentId, worker, { answer, model: "qwen3:4b", promptVersion: "t-1" })).toEqual({ settled: true });
    await expect(submitAnswer(db, claimed.assignmentId, worker, { answer })).rejects.toMatchObject({ status: 409 });

    const notes = await db.select().from(listingAnnotation);
    expect(notes.map((n) => n.field).sort()).toEqual(["area", "category", "condition", "materials", "origin"]);
    expect(notes[0]).toMatchObject({ method: "model", model: "qwen3:4b", promptVersion: "t-1", confidence: 0.8, jobId: claimed.jobId });
    const [category] = await db.select().from(listingValue).where(eq(listingValue.field, "category"));
    expect(category!.value).toBe("outerwear");
    const [done] = await db.select().from(assignment);
    expect(done!.accepted).toBe(true);
    // Placed now, so it isn't queued again.
    expect(await queueExtractFacts(db)).toBe(0);
  });

  it("ignores a category on something the answer says isn't clothing", async () => {
    await listings("Hana Towel");
    await queueExtractFacts(db);
    const worker = await contributorId(db, "gpu-1", "worker");
    const claimed = (await claimJob(db, worker))!;
    await submitAnswer(db, claimed.assignmentId, worker, { answer: { ...answer, area: "home", category: "dresses", department: "women" } });
    const fields = (await db.select({ field: listingAnnotation.field }).from(listingAnnotation)).map((n) => n.field).sort();
    expect(fields).toEqual(["area", "condition", "materials", "origin"]);
  });

  it("with several copies, keeps the answer most contributors gave", async () => {
    await listings("Hunter");
    await queueExtractFacts(db);
    await db.update(job).set({ copies: 3 });
    const ids = await Promise.all(["a", "b", "c"].map((h) => contributorId(db, h, "worker")));
    const answers = [answer, answer, { ...answer, category: "shirts" }];
    for (const [i, id] of ids.entries()) {
      const claimed = (await claimJob(db, id))!;
      await submitAnswer(db, claimed.assignmentId, id, { answer: answers[i] });
    }
    const accepted = await db.select({ accepted: assignment.accepted }).from(assignment).orderBy(assignment.claimedAt);
    expect(accepted.map((a) => a.accepted)).toEqual([true, true, false]);
    const [category] = await db.select().from(listingValue).where(eq(listingValue.field, "category"));
    expect(category!.value).toBe("outerwear");
  });
});

describe("the contributor API and worker", () => {
  it("refuses calls without a valid token", async () => {
    const api = hubApi(db);
    expect((await api.request("/api/jobs/claim", { method: "POST" })).status).toBe(401);
    expect((await api.request("/api/jobs/claim", { method: "POST", headers: { authorization: "Bearer nope" } })).status).toBe(401);
  });

  it("answers jobs with a local model through the API until the queue is empty", async () => {
    await listings("Hunter", "Ranger");
    await queueExtractFacts(db);
    const token = await issueToken(db, "zack-gpu", "worker");
    const api = hubApi(db);
    const prompts: unknown[] = [];
    const fakeFetch: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.port === "11434") {
        const body = JSON.parse(String(init?.body));
        prompts.push(body);
        return Response.json({ message: { content: JSON.stringify(answer) } });
      }
      return api.request(url.pathname, init);
    };
    const result = await runWorker({ hub: "http://hub.test", token, ollama: "http://localhost:11434", model: "qwen3:4b", fetch: fakeFetch });
    expect(result).toEqual({ answered: 2, rejected: 0 });
    expect(prompts[0]).toMatchObject({ model: "qwen3:4b", think: false, format: { type: "object" } });
    expect(await db.select().from(listingValue).where(eq(listingValue.field, "category"))).toHaveLength(2);
  });
});
