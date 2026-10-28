import { extractFacts, fieldVersion, jobKinds, parseAnswer, type JobKind, type Reading } from "@skeleton/formats";
import { type HubDb, schema } from "@skeleton/hub-db";
import { and, eq, sql } from "drizzle-orm";
import { areaOf, catalogCategorySchema } from "@skeleton/shared";
import { resolveListings } from "./resolve.js";
import { directMethod } from "./roles.js";

const { assignment, contributor, job, listingAnnotation } = schema;

// How long a claimed job stays with its contributor before someone else may take it.
const LEASE_MS = 10 * 60 * 1000;

/**
 * Queue an extract-facts job for active listings on approved sites that have no final category
 * and no open job of that kind yet: the listings the rules couldn't place. Returns how many it queued.
 */
export async function queueExtractFacts(db: HubDb, limit = 1000): Promise<number> {
  const result = await db.execute(sql`
    insert into job (kind, kind_version, level, subject_kind, subject_id, input, copies, priority)
    select ${extractFacts.kind}, ${extractFacts.version}, ${extractFacts.level}, 'listing', latest.listing_id,
           jsonb_strip_nulls(jsonb_build_object(
             'title', latest.data->'title', 'description', left(latest.data->>'description', 2000),
             'maker', latest.data->'maker', 'productType', latest.data->'productType', 'tags', coalesce(latest.data->'tags', '[]'::jsonb))),
           1, 0
    from (
      select distinct on (l.id) l.id as listing_id, r.data
      from listing l
      join source s on s.id = l.source_id and s.status = 'approved'
      join reading r on r.listing_id = l.id
      where l.gone_at is null
        and not exists (select 1 from listing_value v where v.listing_id = l.id and v.field = 'category')
        and not exists (select 1 from job j where j.subject_id = l.id and j.kind = ${extractFacts.kind} and j.status = 'open')
      order by l.id, r.read_at desc, r.id desc
      limit ${limit}
    ) latest`);
  return result.count;
}

export type ClaimedJob = { assignmentId: string; jobId: string; kind: string; version: number; input: unknown };

/**
 * Hand a contributor the most urgent open job it can do: one it hasn't answered, whose answers so
 * far (and live claims) are fewer than it needs. Concurrent claims never get the same slot.
 */
export async function claimJob(db: HubDb, contributorId: string, can: { kinds?: string[]; levels?: number[] } = {}): Promise<ClaimedJob | null> {
  const kinds = can.kinds?.length ? can.kinds : Object.keys(jobKinds);
  const levels = can.levels?.length ? can.levels : [1, 2, 3, 4];
  return db.transaction(async (tx) => {
    const rows = await tx.execute<{ id: string; kind: string; kind_version: number; input: unknown }>(sql`
      select j.id, j.kind, j.kind_version, j.input from job j
      where j.status = 'open' and j.kind in ${kinds} and j.level in ${levels}
        and not exists (select 1 from assignment a where a.job_id = j.id and a.contributor_id = ${contributorId})
        and (select count(*) from assignment a where a.job_id = j.id and (a.submitted_at is not null or a.expires_at > now())) < j.copies
      order by j.priority desc, j.created_at
      limit 1
      for update skip locked`);
    const found = rows[0];
    if (!found) return null;
    const [claimed] = await tx
      .insert(assignment)
      .values({ jobId: found.id, contributorId, expiresAt: new Date(Date.now() + LEASE_MS) })
      .returning({ id: assignment.id });
    return { assignmentId: claimed!.id, jobId: found.id, kind: found.kind, version: found.kind_version, input: found.input };
  });
}

export type Submission = { answer: unknown; model?: string; promptVersion?: string };

// How a settled answer ranks, by who gave it. A person ranks as one only with a curator's role.
const METHOD_BY_KIND = { person: "agent", agent: "agent", worker: "model", system: "rule" } as const;
const methodOf = (author: { kind: string; role: string } | undefined) =>
  author?.kind === "person" ? directMethod(author) : METHOD_BY_KIND[(author?.kind ?? "worker") as keyof typeof METHOD_BY_KIND];

/**
 * Record a contributor's answer. It must fit the job kind's answer format, or nothing is stored.
 * Once the job has all the answers it wants it settles: with one copy the answer is accepted as it
 * is; with more, the answer most of them gave wins and the others are marked not accepted. The
 * accepted answer becomes annotations, and the listing's final values are brought up to date.
 */
export async function submitAnswer(db: HubDb, assignmentId: string, contributorId: string, submission: Submission) {
  const [claimed] = await db
    .select({ assignment, job, kind: contributor.kind })
    .from(assignment)
    .innerJoin(job, eq(job.id, assignment.jobId))
    .innerJoin(contributor, eq(contributor.id, assignment.contributorId))
    .where(and(eq(assignment.id, assignmentId), eq(assignment.contributorId, contributorId)));
  if (!claimed) throw new JobError(404, "no such assignment for this contributor");
  if (claimed.assignment.submittedAt) throw new JobError(409, "already answered");
  if (claimed.job.status !== "open") throw new JobError(409, "this job is already settled");
  let answer: unknown;
  try {
    answer = parseAnswer(claimed.job.kind, claimed.job.kindVersion, submission.answer);
  } catch (error) {
    throw new JobError(422, `the answer doesn't fit ${claimed.job.kind} v${claimed.job.kindVersion}: ${error instanceof Error ? error.message : error}`);
  }
  await db.update(assignment).set({ submittedAt: new Date(), result: { answer, model: submission.model, promptVersion: submission.promptVersion } }).where(eq(assignment.id, assignmentId));

  const answers = await db.select().from(assignment).where(and(eq(assignment.jobId, claimed.job.id), sql`${assignment.submittedAt} is not null`));
  if (answers.length < claimed.job.copies) return { settled: false };

  const votes = new Map<string, typeof answers>();
  for (const a of answers) {
    const key = JSON.stringify((a.result as { answer: unknown }).answer);
    votes.set(key, [...(votes.get(key) ?? []), a]);
  }
  const winners = [...votes.values()].sort((x, y) => y.length - x.length)[0]!;
  const chosen = winners[0]!;
  await db.transaction(async (tx) => {
    for (const a of answers) await tx.update(assignment).set({ accepted: winners.includes(a) }).where(eq(assignment.id, a.id));
    await tx.update(job).set({ status: "settled", settledAt: new Date() }).where(eq(job.id, claimed.job.id));
    const result = chosen.result as { answer: Record<string, unknown>; model?: string; promptVersion?: string };
    const [author] = await tx.select({ kind: contributor.kind, role: contributor.role }).from(contributor).where(eq(contributor.id, chosen.contributorId));
    const rows = annotationsFrom(claimed.job.kind as JobKind, result.answer).map(({ field, value }) => ({
      listingId: claimed.job.subjectId,
      field,
      fieldVersion: fieldVersion("listing", field),
      value,
      confidence: typeof result.answer.confidence === "number" ? result.answer.confidence : null,
      reason: typeof result.answer.reason === "string" ? result.answer.reason : null,
      method: methodOf(author),
      model: result.model ?? null,
      promptVersion: result.promptVersion ?? null,
      contributorId: chosen.contributorId,
      jobId: claimed.job.id,
    }));
    if (rows.length) await tx.insert(listingAnnotation).values(rows);
  });
  if (claimed.job.subjectKind === "listing") await resolveListings(db, [claimed.job.subjectId]);
  return { settled: true };
}

/**
 * The listing fields an answer sets: every field it states, leaving out the unknowns and its own
 * bookkeeping. Categories and departments are clothing's, so an answer that calls the thing
 * something other than clothing doesn't get to set them, whatever else it filled in.
 */
function annotationsFrom(kind: JobKind, answer: Record<string, unknown>): { field: string; value: unknown }[] {
  if (kind === "judge-source") return [];
  // A category from another area than the answer's own is a contradiction; trust neither.
  const area = typeof answer.area === "string" ? answer.area : null;
  const category = catalogCategorySchema.safeParse(answer.category);
  const consistent = !category.success || area === null || areaOf(category.data) === area;
  const clothing = area === null || area === "clothing";
  return Object.entries(answer).flatMap(([field, value]) => {
    if (field === "confidence" || field === "reason" || value === null) return [];
    if (field === "category" && !consistent) return [];
    if (field === "department" && !clothing) return [];
    if (Array.isArray(value) && !value.length) return [];
    return [{ field, value }];
  });
}

export class JobError extends Error {
  constructor(readonly status: 404 | 409 | 422, message: string) {
    super(message);
  }
}

/** The input a reading gives an extract-facts job, for workers and tests. */
export const extractInput = (r: Reading) =>
  extractFacts.input.parse({ title: r.title, description: r.description?.slice(0, 2000), maker: r.maker, productType: r.productType, tags: r.tags });
