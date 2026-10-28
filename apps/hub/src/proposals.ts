import type { ReadingInput } from "@skeleton/formats";
import { type HubDb, schema } from "@skeleton/hub-db";
import { and, count, desc, eq, inArray, max } from "drizzle-orm";
import {
  catalogRecipeSchema,
  politeContext,
  RECIPE_FORMAT,
  readers,
  readWithRecipe,
  recipePages,
  type ReadContext,
  type RecipePage,
} from "@skeleton/engine";
import { type CrawlOptions, httpsOrigin } from "./engine/crawl.js";
import { contributorId, HUB } from "./contributors.js";
import { assignReader, domainOf } from "./sources.js";

const { contributor, proposal, reader: readerTable, recipe, source } = schema;

// Pages the hub tries a proposal on, and how many must read cleanly for a curator to see it.
export const SAMPLE_PAGES = 5;
export const MUST_READ = 4;
// Proposals one contributor may have waiting at once, so a runaway agent can't flood the queue.
export const MAX_PENDING = 25;

export class ProposalError extends Error {
  constructor(
    readonly status: 404 | 409 | 422,
    message: string,
    readonly report?: SampleReport,
  ) {
    super(message);
  }
}

export type SampleReport = { pagesFound: number; read: number; pages: RecipePage[] };

const readable = (report: SampleReport) => report.read > 0 && report.read >= Math.min(MUST_READ, report.pagesFound);

/** Pages spread through the list rather than its first few, which are often the same collection. */
function sample<T>(items: T[], n: number): T[] {
  if (items.length <= n) return items;
  return Array.from({ length: n }, (_, i) => items[Math.floor((i * items.length) / n)]!);
}

/** A few of the site's products, read the way the proposal says the hub should read them. */
async function trySite(origin: URL, ctx: ReadContext, how: { readerId: string; config: Record<string, unknown> | null }): Promise<SampleReport> {
  if (how.readerId === "recipe") {
    const spec = catalogRecipeSchema.parse(how.config?.recipe);
    const found = await recipePages(origin, spec, ctx, 200);
    const pages: RecipePage[] = [];
    for (const url of sample(found, SAMPLE_PAGES)) {
      try {
        pages.push(readWithRecipe((await ctx.fetch(url, "text/html")).body.toString("utf8"), url, spec));
      } catch (error) {
        pages.push({ url, reading: null, issues: [`fetch: ${error instanceof Error ? error.message : "failed"}`] });
      }
    }
    return { pagesFound: found.length, read: pages.filter((p) => p.reading).length, pages };
  }
  const platform = readers.find((r) => r.id === how.readerId)!;
  if (platform.sample) {
    const tried = await platform.sample(origin, how.config, ctx, SAMPLE_PAGES);
    return { pagesFound: tried.pagesFound, read: tried.pages.filter((p) => p.reading).length, pages: tried.pages };
  }
  // A reader without its own sample reads the site from the start; its first few products are the sample.
  const pages: RecipePage[] = [];
  for await (const reading of platform.read(origin, how.config, ctx)) {
    pages.push({ url: reading.url, reading: reading as ReadingInput, issues: [] });
    if (pages.length >= SAMPLE_PAGES) break;
  }
  return { pagesFound: pages.length, read: pages.length, pages };
}

/**
 * A contributor's proposal of a site: why it belongs and, for a site no platform reader recognises,
 * a recipe. The hub tries it on the site's own products first; only a proposal that reads them waits
 * for a curator, and one that doesn't comes straight back with what went wrong. Sending it again while
 * it waits replaces it.
 */
// Not one shop but thousands of sellers on one site: they need their own model, so they aren't proposable.
const MARKETPLACES = /(^|\.)(amazon|ebay|etsy|aliexpress|alibaba|temu|wish|mercari|poshmark|depop|vinted|grailed|mercadolibre|rakuten)\.[a-z.]+$/i;
// Different makers among the sample products from which a shop looks like a reseller or a multi-brand store.
const MANY_MAKERS = 3;

/**
 * Why a curator should look at a proposal before it goes in: a proposer with no approved proposal
 * yet, a shop selling many brands, products naming no maker. None of them refuses it.
 */
export async function flagsFor(db: HubDb, proposerId: string, report: SampleReport): Promise<string[]> {
  const flags: string[] = [];
  const [approved] = await db.select({ n: count() }).from(proposal).where(and(eq(proposal.proposerId, proposerId), eq(proposal.status, "approved")));
  if (!approved!.n) flags.push("first proposal from this contributor");
  const readings = report.pages.flatMap((p) => (p.reading ? [p.reading] : []));
  const makers = new Set(readings.flatMap((r) => (r.maker ? [r.maker.toLowerCase()] : [])));
  if (makers.size >= MANY_MAKERS) flags.push(`sells many brands (${makers.size} among ${readings.length} samples): a reseller or a multi-brand shop`);
  if (!makers.size) flags.push("its products name no maker");
  return flags;
}

export async function proposeSite(
  db: HubDb,
  proposerId: string,
  input: { url: string; note: string; recipe?: unknown },
  options: CrawlOptions = {},
) {
  let domain: string;
  try {
    domain = domainOf(input.url);
  } catch {
    throw new ProposalError(422, "that isn't a web address");
  }
  if (MARKETPLACES.test(domain)) throw new ProposalError(422, "a marketplace is thousands of sellers, not one shop: propose the shops themselves");
  const [known] = await db.select().from(source).where(eq(source.domain, domain));
  if (known?.status === "approved" || known?.status === "paused") throw new ProposalError(409, "the hub already reads this site");
  if (known?.status === "rejected") throw new ProposalError(409, "a curator already declined this site");
  const [waiting] = known ? await db.select().from(proposal).where(and(eq(proposal.sourceId, known.id), eq(proposal.status, "pending"))) : [];
  if (waiting && waiting.proposerId !== proposerId) throw new ProposalError(409, "someone else's proposal of this site is waiting for review");
  if (!waiting) {
    const [mine] = await db.select({ n: count() }).from(proposal).where(and(eq(proposal.proposerId, proposerId), eq(proposal.status, "pending")));
    if (mine!.n >= MAX_PENDING) throw new ProposalError(409, `you have ${MAX_PENDING} proposals waiting for review already`);
  }

  // How the hub would read it: a recipe sent with it, or else the first platform reader that knows the site.
  const origin = (options.originOf ?? httpsOrigin)(domain);
  const ctx = await politeContext(origin, options);
  let how: { readerId: string; config: Record<string, unknown> | null };
  if (input.recipe !== undefined) {
    const spec = catalogRecipeSchema.safeParse(input.recipe);
    if (!spec.success) throw new ProposalError(422, `the recipe doesn't fit format ${RECIPE_FORMAT}: ${spec.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    how = { readerId: "recipe", config: { recipe: spec.data } };
  } else {
    const enabled = new Set((await db.select({ id: readerTable.id }).from(readerTable).where(eq(readerTable.enabled, true))).map((r) => r.id));
    let found: typeof how | null = null;
    for (const platform of readers.filter((r) => enabled.has(r.id))) {
      const detected = await platform.detect(origin, ctx).catch(() => null);
      if (detected) {
        found = { readerId: platform.id, config: detected.config ?? null };
        break;
      }
    }
    if (!found) throw new ProposalError(422, "no platform reader recognises this site: send it again with a recipe saying how to read its product pages");
    how = found;
  }
  const report = await trySite(origin, ctx, how);
  if (!readable(report)) throw new ProposalError(422, `the hub read ${report.read} of ${report.pages.length} sample pages (${report.pagesFound} found); see each page's problems, fix them and send it again`, report);

  const flags = await flagsFor(db, proposerId, report);
  const made = await db.transaction(async (tx) => {
    const [site] = known
      ? [known]
      : await tx.insert(source).values({ domain, addedById: proposerId }).onConflictDoNothing({ target: source.domain }).returning();
    if (!site) throw new ProposalError(409, "this site was just proposed; try again");
    let recipeId: string | null = null;
    if (how.readerId === "recipe") {
      const [last] = await tx.select({ version: max(recipe.version) }).from(recipe).where(eq(recipe.sourceId, site.id));
      const [made] = await tx
        .insert(recipe)
        .values({ sourceId: site.id, version: (last?.version ?? 0) + 1, formatVersion: RECIPE_FORMAT, spec: how.config!.recipe, status: "draft", testReport: report, authorId: proposerId })
        .returning({ id: recipe.id });
      recipeId = made!.id;
    }
    const values = { note: input.note, readerId: how.readerId, readerConfig: how.config, recipeId, report, flags, updatedAt: new Date() };
    if (waiting) {
      if (waiting.recipeId) await tx.update(recipe).set({ status: "retired" }).where(eq(recipe.id, waiting.recipeId));
      await tx.update(proposal).set(values).where(eq(proposal.id, waiting.id));
      return { proposalId: waiting.id, domain, reader: how.readerId, replaced: true, report };
    }
    const [made] = await tx.insert(proposal).values({ sourceId: site.id, proposerId, ...values }).returning({ id: proposal.id });
    return { proposalId: made!.id, domain, reader: how.readerId, replaced: false, report };
  });
  // Nothing for a curator to look at: it goes in on its own, decided by the hub.
  if (flags.length) return { ...made, status: "pending" as const, flags };
  await decideProposal(db, await contributorId(db, HUB.handle, HUB.kind), made.proposalId, true);
  return { ...made, status: "approved" as const, flags };
}

/** Proposals waiting for a curator, oldest first, each with who sent it, why, and what the hub read. */
export async function pendingProposals(db: HubDb) {
  return db
    .select({
      id: proposal.id,
      domain: source.domain,
      proposer: contributor.handle,
      note: proposal.note,
      reader: proposal.readerId,
      report: proposal.report,
      flags: proposal.flags,
      updatedAt: proposal.updatedAt,
    })
    .from(proposal)
    .innerJoin(source, eq(source.id, proposal.sourceId))
    .innerJoin(contributor, eq(contributor.id, proposal.proposerId))
    .where(eq(proposal.status, "pending"))
    .orderBy(proposal.updatedAt)
    .limit(100);
}

/**
 * A curator's one call on a proposal. Approved: the site is read the way it proposed from the next
 * crawl (its recipe goes live, any earlier one retires). Rejected: the site stays known as declined,
 * so it isn't proposed again. Null when no proposal with that id is waiting.
 */
export async function decideProposal(db: HubDb, curatorId: string, proposalId: string, approve: boolean) {
  return db.transaction(async (tx) => {
    const [waiting] = await tx.select().from(proposal).where(and(eq(proposal.id, proposalId), eq(proposal.status, "pending")));
    if (!waiting) return null;
    await tx.update(proposal).set({ status: approve ? "approved" : "rejected", decidedById: curatorId, decidedAt: new Date() }).where(eq(proposal.id, proposalId));
    if (!approve) {
      if (waiting.recipeId) await tx.update(recipe).set({ status: "retired" }).where(eq(recipe.id, waiting.recipeId));
      await tx.update(source).set({ status: "rejected" }).where(and(eq(source.id, waiting.sourceId), eq(source.status, "candidate")));
      return { id: proposalId, status: "rejected" as const };
    }
    if (waiting.recipeId) {
      await tx.update(recipe).set({ status: "retired" }).where(and(eq(recipe.sourceId, waiting.sourceId), inArray(recipe.status, ["live"])));
      await tx.update(recipe).set({ status: "live" }).where(eq(recipe.id, waiting.recipeId));
    }
    const config = waiting.recipeId ? { ...(waiting.readerConfig as Record<string, unknown>), recipeId: waiting.recipeId } : (waiting.readerConfig as Record<string, unknown> | null);
    await assignReader(tx as unknown as HubDb, waiting.sourceId, waiting.readerId, { evidence: { proposalId }, config, by: curatorId });
    await tx.update(source).set({ status: "approved", nextCrawlAt: new Date() }).where(eq(source.id, waiting.sourceId));
    return { id: proposalId, status: "approved" as const };
  });
}

/** Newest decisions first, for a contributor to see how their proposals went. */
export async function proposalsBy(db: HubDb, proposerId: string) {
  return db
    .select({ id: proposal.id, domain: source.domain, status: proposal.status, updatedAt: proposal.updatedAt })
    .from(proposal)
    .innerJoin(source, eq(source.id, proposal.sourceId))
    .where(eq(proposal.proposerId, proposerId))
    .orderBy(desc(proposal.updatedAt))
    .limit(50);
}
