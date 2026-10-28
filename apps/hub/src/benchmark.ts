import { extractFacts, fieldVersion, type Reading } from "@skeleton/formats";
import { type HubDb, schema } from "@skeleton/hub-db";
import { areaOf, areaSchema, catalogCategorySchema, departments } from "@skeleton/shared";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { resolveListings } from "./resolve.js";
import { instructionsFor } from "./worker.js";

const { benchmark, contributor, listingAnnotation } = schema;

/**
 * What a person checks for each listing: the facts that decide where it shows. null is an answer
 * ("not something we sort", "not said"). A category must belong to the area; a side only to clothing.
 */
export const checkSchema = z
  .object({
    area: areaSchema.nullable(),
    category: catalogCategorySchema.nullable(),
    department: z.enum(departments).nullable(),
    audience: z.enum(["adults", "kids"]),
  })
  .refine((c) => c.category === null || (c.area !== null && areaOf(c.category) === c.area), "the category isn't in that area")
  .refine((c) => c.department === null || c.area === "clothing", "only clothing has a side");
export type Check = z.infer<typeof checkSchema>;

const CHECKED = ["area", "category", "department", "audience"] as const;

// The fields a model's extract-facts answer is scored on.
export const SCORED = ["area", "category", "department"] as const;

/**
 * Draw a benchmark set: `random` active listings from approved sites, plus `unplaced` the rules
 * couldn't give a category (the hard ones, which models are for). Listings already in it stay.
 */
export async function drawBenchmark(db: HubDb, name: string, counts: { random: number; unplaced: number }): Promise<number> {
  const pick = (where: ReturnType<typeof sql>, limit: number) => sql`
    insert into benchmark (name, listing_id)
    select ${name}, l.id from listing l join source s on s.id = l.source_id and s.status = 'approved'
    where l.gone_at is null and ${where}
      and not exists (select 1 from benchmark b where b.name = ${name} and b.listing_id = l.id)
    order by random() limit ${limit}`;
  const unplaced = await db.execute(
    pick(sql`not exists (select 1 from listing_value v where v.listing_id = l.id and v.field = 'category')`, counts.unplaced),
  );
  const random = await db.execute(pick(sql`true`, counts.random));
  return unplaced.count + random.count;
}

export type BenchmarkItem = {
  listingId: string;
  url: string;
  input: z.infer<typeof extractFacts.input>;
  image: string | null;
  draft: Check | null;
  answer: Check | null;
};

/** A set's listings with what a checker needs: the words a model sees, a photo, the draft and any answer. */
export async function benchmarkItems(db: HubDb, name: string): Promise<BenchmarkItem[]> {
  const rows = await db.execute<{ listing_id: string; url: string; data: Reading; draft: Check | null; answer: Check | null }>(sql`
    select distinct on (b.listing_id) b.listing_id, l.url, r.data, b.draft, b.answer
    from benchmark b join listing l on l.id = b.listing_id join reading r on r.listing_id = l.id
    where b.name = ${name}
    order by b.listing_id, r.read_at desc, r.id desc`);
  return rows.map((r) => ({
    listingId: r.listing_id,
    url: r.url,
    input: extractFacts.input.parse({
      title: r.data.title,
      description: r.data.description?.slice(0, 2000),
      maker: r.data.maker,
      productType: r.data.productType,
      tags: r.data.tags ?? [],
    }),
    image: r.data.images?.[0]?.url ?? null,
    draft: r.draft,
    answer: r.answer,
  }));
}

/** Store drafts (from an agent) for a set's listings. Drafts that don't fit the check format are skipped. */
export async function saveDrafts(db: HubDb, name: string, drafts: { listingId: string; draft: unknown }[]): Promise<{ saved: number; invalid: number }> {
  let saved = 0;
  let invalid = 0;
  for (const d of drafts) {
    const parsed = checkSchema.safeParse(d.draft);
    if (!parsed.success) {
      invalid++;
      continue;
    }
    const done = await db
      .update(benchmark)
      .set({ draft: parsed.data })
      .where(and(eq(benchmark.name, name), eq(benchmark.listingId, d.listingId)))
      .returning({ listingId: benchmark.listingId });
    saved += done.length;
  }
  return { saved, invalid };
}

/**
 * A check of one listing: kept as the set's answer, and every stated fact added as an annotation by
 * whoever checked it (a person's outranks every model's; a panel of agents' outranks a single model's),
 * so the catalog is corrected at the same time.
 */
export async function recordCheck(db: HubDb, name: string, listingId: string, contributorId: string, check: unknown): Promise<Check> {
  const answer = checkSchema.parse(check);
  const [who] = await db.select({ kind: contributor.kind }).from(contributor).where(eq(contributor.id, contributorId));
  const method = who?.kind === "person" ? "person" : "agent";
  const updated = await db
    .update(benchmark)
    .set({ answer, checkedById: contributorId, checkedAt: new Date() })
    .where(and(eq(benchmark.name, name), eq(benchmark.listingId, listingId)))
    .returning({ listingId: benchmark.listingId });
  if (!updated.length) throw new Error("that listing isn't in this set");
  const facts = Object.entries(answer).filter(([, value]) => value !== null);
  if (facts.length) {
    await db.insert(listingAnnotation).values(
      facts.map(([field, value]) => ({
        listingId,
        field,
        fieldVersion: fieldVersion("listing", field),
        value,
        method,
        reason: `checked for benchmark ${name}`,
        contributorId,
      })),
    );
  }
  await resolveListings(db, [listingId]);
  return answer;
}

// The confidences a model's answers are cut at, to see whether its sure answers are the right ones.
const CUTS = [0.5, 0.7, 0.8, 0.9];

export type Score = {
  model: string;
  checked: number;
  failed: number;
  accuracy: Record<string, number>;
  /** For answers at or above each confidence: the share of listings they cover, and their accuracy. */
  byConfidence: { at: number; kept: number; accuracy: Record<string, number> }[];
  misses: { title: string; field: string; expected: unknown; got: unknown; confidence: number }[];
};

/**
 * Run a local model over a set's checked listings with the worker's own instructions, and score it
 * field by field against the checked answers, overall and at each confidence it gave.
 */
export async function scoreModel(db: HubDb, name: string, options: { ollama: string; model: string; fetch?: typeof fetch }): Promise<Score> {
  const http = options.fetch ?? fetch;
  const items = (await benchmarkItems(db, name)).filter((i) => i.answer);
  const marks: { confidence: number; right: Record<string, boolean> }[] = [];
  const misses: Score["misses"] = [];
  let failed = 0;
  for (const item of items) {
    const reply = await http(new URL("/api/chat", options.ollama), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: options.model,
        stream: false,
        think: false,
        format: z.toJSONSchema(extractFacts.answer),
        options: { temperature: 0 },
        messages: [
          { role: "system", content: instructionsFor("extract-facts") },
          { role: "user", content: JSON.stringify(item.input) },
        ],
      }),
    });
    const content = reply.ok ? (((await reply.json()) as { message?: { content?: string } }).message?.content ?? "") : "";
    const got = extractFacts.answer.safeParse((() => { try { return JSON.parse(content); } catch { return null; } })());
    if (!got.success) {
      failed++;
      continue;
    }
    const right: Record<string, boolean> = {};
    for (const field of SCORED) {
      const expected = item.answer![field];
      right[field] = got.data[field] === expected;
      if (!right[field]) misses.push({ title: item.input.title, field, expected, got: got.data[field], confidence: got.data.confidence });
    }
    marks.push({ confidence: got.data.confidence, right });
  }
  // A failed answer counts as wrong on every field, so accuracy is out of every checked listing.
  const share = (n: number, of: number) => (of ? Math.round((n / of) * 1000) / 1000 : 0);
  const accuracyOf = (kept: typeof marks, of: number) => Object.fromEntries(SCORED.map((f) => [f, share(kept.filter((m) => m.right[f]).length, of)]));
  const byConfidence = CUTS.map((at) => {
    const kept = marks.filter((m) => m.confidence >= at);
    return { at, kept: share(kept.length, items.length), accuracy: accuracyOf(kept, kept.length) };
  });
  return { model: options.model, checked: items.length, failed, accuracy: accuracyOf(marks, items.length), byConfidence, misses };
}

/**
 * Settle a set from two independent labellers' answers: where they agree, that is the answer,
 * recorded as the panel's; where they don't, both are returned for a judge to decide.
 */
export async function settleByAgreement(
  db: HubDb,
  name: string,
  panelId: string,
  first: { listingId: string; draft: unknown }[],
  second: { listingId: string; draft: unknown }[],
): Promise<{ agreed: number; disagreements: { listingId: string; a: Check; b: Check }[]; invalid: number }> {
  const other = new Map(second.map((s) => [s.listingId, s.draft]));
  const disagreements: { listingId: string; a: Check; b: Check }[] = [];
  let agreed = 0;
  let invalid = 0;
  for (const f of first) {
    const a = checkSchema.safeParse(f.draft);
    const b = checkSchema.safeParse(other.get(f.listingId));
    if (!a.success || !b.success) {
      invalid++;
      continue;
    }
    if (CHECKED.every((field) => a.data[field] === b.data[field])) {
      await recordCheck(db, name, f.listingId, panelId, a.data);
      agreed++;
    } else disagreements.push({ listingId: f.listingId, a: a.data, b: b.data });
  }
  return { agreed, disagreements, invalid };
}
