import { sql } from "drizzle-orm";
import {
  customType,
  bigint,
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * The hub's database: everything that builds the shared catalog, and nothing about the people who
 * use the app. Three layers (docs: catalog engine design): raw readings of what sites show,
 * annotations (every conclusion anyone drew, only ever added), and the final values worked out from
 * them, which catalog builds publish.
 *
 * Fixed sets of values live in the shared formats; the checks here keep the database honest.
 */

const createdAt = timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = timestamp("updated_at", { withTimezone: true })
  .notNull()
  .defaultNow()
  .$onUpdate(() => new Date());

const oneOf = (column: string, values: readonly string[]) =>
  sql.raw(`${column} in (${values.map((v) => `'${v}'`).join(", ")})`);

export const CONTRIBUTOR_KINDS = ["person", "worker", "agent", "system"] as const;
// What a contributor may change. Anyone with a token answers jobs, which count only when copies
// agree; curators, who applied and were approved, check and correct directly; the owner approves them.
export const ROLES = ["contributor", "curator", "owner"] as const;
export const APPLICATION_STATUSES = ["pending", "approved", "declined"] as const;
export const SOURCE_STATUSES = ["candidate", "approved", "paused", "rejected"] as const;
export const READERS = ["shopify", "woocommerce", "bigcommerce", "squarespace", "standard", "recipe"] as const;
export const RECIPE_STATUSES = ["draft", "live", "retired"] as const;
export const CRAWL_STATUSES = ["running", "done", "failed", "blocked"] as const;
export const METHODS = ["rule", "model", "agent", "person"] as const;
export const JOB_STATUSES = ["open", "settled", "failed", "cancelled"] as const;
export const SUBJECTS = ["listing", "source"] as const;

/**
 * Who did the work: a person, a local worker, an agent session, or the hub's own rules.
 * `trust` (0 to 1) is learned from hidden test jobs and agreement with others; `role` is granted.
 */
export const contributor = pgTable(
  "contributor",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    handle: text("handle").notNull().unique(),
    kind: text("kind").notNull(),
    trust: real("trust").notNull().default(0.5),
    role: text("role").notNull().default("contributor"),
    // SHA-256 of the token a worker or agent sends with its answers; null for those that never call in.
    tokenHash: text("token_hash").unique(),
    createdAt,
  },
  () => [check("contributor_kind_check", oneOf("kind", CONTRIBUTOR_KINDS)), check("contributor_role_check", oneOf("role", ROLES))],
);

/** A contributor asking for a role, with what they'd do with it; the owner decides. One open at a time. */
export const application = pgTable(
  "application",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contributorId: uuid("contributor_id")
      .notNull()
      .references(() => contributor.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    note: text("note").notNull(),
    status: text("status").notNull().default("pending"),
    decidedById: uuid("decided_by_id").references(() => contributor.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt,
  },
  (table) => [
    check("application_role_check", oneOf("role", ["curator"])),
    check("application_status_check", oneOf("status", APPLICATION_STATUSES)),
    uniqueIndex("application_one_open").on(table.contributorId).where(sql`status = 'pending'`),
  ],
);

/**
 * The readers the hub's code provides: one per platform (shared by every site on it), the
 * standard-data reader, and "recipe", which reads a site by its own live recipe. Rows mirror the
 * code (seeded by migration) so assignments and crawls can point at a real reader and its version.
 */
export const reader = pgTable(
  "reader",
  {
    id: text("id").primaryKey(),
    // Bumped when the reader's output changes, so readings can be traced to the code that made them.
    version: integer("version").notNull().default(1),
    enabled: boolean("enabled").notNull().default(true),
    description: text("description").notNull(),
  },
  () => [check("reader_id_check", oneOf("id", READERS))],
);

/**
 * One site we read. Starts as a candidate (someone pasted it, or discovery found it) and becomes
 * approved once it has been read and judged. Each site is assigned one reader: by detection when it
 * is added, or by a person or agent. The assignment records who made it, when and on what evidence
 * (platform fingerprints found), and `readerConfig` holds that reader's small per-site settings, if any.
 */
export const source = pgTable(
  "source",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Lowercased host without "www.": one source per site.
    domain: text("domain").notNull().unique(),
    status: text("status").notNull().default("candidate"),
    // The assigned reader; null until detection (or someone) assigns one.
    readerId: text("reader_id").references(() => reader.id),
    readerConfig: jsonb("reader_config"),
    readerAssignedAt: timestamp("reader_assigned_at", { withTimezone: true }),
    readerAssignedById: uuid("reader_assigned_by_id").references(() => contributor.id, { onDelete: "set null" }),
    readerEvidence: jsonb("reader_evidence"),
    // Areas it covers ("clothing", "home", "tech"), from its final values; for filtering the catalog.
    areas: text("areas").array().notNull().default(sql`'{}'::text[]`),
    ownerId: uuid("owner_id").references(() => contributor.id, { onDelete: "set null" }),
    addedById: uuid("added_by_id").references(() => contributor.id, { onDelete: "set null" }),
    crawlEveryHours: integer("crawl_every_hours").notNull().default(168),
    nextCrawlAt: timestamp("next_crawl_at", { withTimezone: true }),
    lastCrawledAt: timestamp("last_crawled_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("source_status_next_crawl_idx").on(table.status, table.nextCrawlAt),
    check("source_status_check", oneOf("status", SOURCE_STATUSES)),
  ],
);

/**
 * How to read a site no built-in reader covers: our recipe format (shared formats), filled in by an
 * agent and tested before it goes live. Rules only, never code. Each change is a new version; at most
 * one is live per source, and every crawl records the version that read it.
 */
export const recipe = pgTable(
  "recipe",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => source.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    formatVersion: integer("format_version").notNull(),
    spec: jsonb("spec").notNull(),
    status: text("status").notNull().default("draft"),
    // What the test run found: sample pages, fields filled, mismatches with the author's own reading.
    testReport: jsonb("test_report"),
    authorId: uuid("author_id").references(() => contributor.id, { onDelete: "set null" }),
    createdAt,
  },
  (table) => [
    uniqueIndex("recipe_source_version_idx").on(table.sourceId, table.version),
    uniqueIndex("recipe_one_live_idx").on(table.sourceId).where(sql`${table.status} = 'live'`),
    check("recipe_status_check", oneOf("status", RECIPE_STATUSES)),
  ],
);

/** One pass over a source: which reader, at which version (and recipe version), and what came back. */
export const crawl = pgTable(
  "crawl",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => source.id, { onDelete: "cascade" }),
    readerId: text("reader_id")
      .notNull()
      .references(() => reader.id),
    readerVersion: integer("reader_version").notNull(),
    recipeId: uuid("recipe_id").references(() => recipe.id, { onDelete: "set null" }),
    status: text("status").notNull().default("running"),
    // Pages fetched, listings seen, new, changed, gone, errors. A sharp drop pauses the source.
    stats: jsonb("stats"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    index("crawl_source_started_idx").on(table.sourceId, table.startedAt),
    check("crawl_status_check", oneOf("status", CRAWL_STATUSES)),
  ],
);

/**
 * One item offered at one site, identified by the site's own id (or its handle or URL when there is
 * none), so readings and annotations survive a title or price change. The same thing sold at three
 * sites is three listings; grouping them into one product comes later.
 */
export const listing = pgTable(
  "listing",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => source.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    url: text("url").notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    // Set when a crawl no longer finds it; cleared if it comes back.
    goneAt: timestamp("gone_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("listing_source_external_idx").on(table.sourceId, table.externalId)],
);

/**
 * What the site showed, as read: title, description, vendor, type, tags, price, currency, photos
 * with sizes, variants, in our reading format. Never touched by AI. A new row only when the content
 * changed (`contentHash`), so the history doubles as price history.
 */
export const reading = pgTable(
  "reading",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listing.id, { onDelete: "cascade" }),
    crawlId: uuid("crawl_id").references(() => crawl.id, { onDelete: "set null" }),
    formatVersion: integer("format_version").notNull(),
    contentHash: text("content_hash").notNull(),
    data: jsonb("data").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("reading_listing_read_idx").on(table.listingId, table.readAt)],
);

/** Who drew a conclusion, how, and from what; shared by both annotation tables. */
const provenance = {
  field: text("field").notNull(),
  fieldVersion: integer("field_version").notNull(),
  value: jsonb("value").notNull(),
  confidence: real("confidence"),
  reason: text("reason"),
  method: text("method").notNull(),
  model: text("model"),
  promptVersion: text("prompt_version"),
  contributorId: uuid("contributor_id")
    .notNull()
    .references(() => contributor.id),
  jobId: uuid("job_id"),
  createdAt,
};

/**
 * One conclusion about a listing: a field (category, material, quality…), its value in that field's
 * format version, and who drew it, how and from which reading. Only ever added.
 */
export const listingAnnotation = pgTable(
  "listing_annotation",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listing.id, { onDelete: "cascade" }),
    // The reading it was drawn from, so a changed listing can be redone.
    readingId: bigint("reading_id", { mode: "number" }).references(() => reading.id, { onDelete: "set null" }),
    ...provenance,
  },
  (table) => [
    index("listing_annotation_listing_field_idx").on(table.listingId, table.field),
    index("listing_annotation_contributor_idx").on(table.contributorId),
    check("listing_annotation_method_check", oneOf("method", METHODS)),
  ],
);

/** One conclusion about a site: real maker or reseller, quality, areas, where it ships from… */
export const sourceAnnotation = pgTable(
  "source_annotation",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => source.id, { onDelete: "cascade" }),
    ...provenance,
  },
  (table) => [
    index("source_annotation_source_field_idx").on(table.sourceId, table.field),
    index("source_annotation_contributor_idx").on(table.contributorId),
    check("source_annotation_method_check", oneOf("method", METHODS)),
  ],
);

/**
 * Each listing field's final value: which annotation won, under which version of the rules. Kept up
 * to date as answers arrive so catalog builds don't rescan every annotation; always recomputable from
 * the annotations, never the source of truth.
 */
export const listingValue = pgTable(
  "listing_value",
  {
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listing.id, { onDelete: "cascade" }),
    field: text("field").notNull(),
    value: jsonb("value").notNull(),
    annotationId: bigint("annotation_id", { mode: "number" })
      .notNull()
      .references(() => listingAnnotation.id, { onDelete: "cascade" }),
    resolverVersion: integer("resolver_version").notNull(),
    updatedAt,
  },
  (table) => [primaryKey({ columns: [table.listingId, table.field] })],
);

/** Each source field's final value, as listing_value. */
export const sourceValue = pgTable(
  "source_value",
  {
    sourceId: uuid("source_id")
      .notNull()
      .references(() => source.id, { onDelete: "cascade" }),
    field: text("field").notNull(),
    value: jsonb("value").notNull(),
    annotationId: bigint("annotation_id", { mode: "number" })
      .notNull()
      .references(() => sourceAnnotation.id, { onDelete: "cascade" }),
    resolverVersion: integer("resolver_version").notNull(),
    updatedAt,
  },
  (table) => [primaryKey({ columns: [table.sourceId, table.field] })],
);

/**
 * Vectors for a listing's photo or text, tagged with the model that made them, so a new embedding
 * model sits beside the old one until it's proven better. Stored plainly: the hub ships them, the
 * app indexes them.
 */
export const embedding = pgTable(
  "embedding",
  {
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listing.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    // "photo" | "text"
    kind: text("kind").notNull(),
    vector: real("vector").array().notNull(),
    readingId: bigint("reading_id", { mode: "number" }).references(() => reading.id, { onDelete: "set null" }),
    createdAt,
  },
  (table) => [
    primaryKey({ columns: [table.listingId, table.model, table.kind] }),
    check("embedding_kind_check", oneOf("kind", ["photo", "text"])),
  ],
);

/**
 * A unit of work in the queue: pull facts from a listing, judge a site, write a recipe… Its input
 * and answer follow the job kind's format version. `copies` answers are wanted before it settles;
 * test jobs carry a known answer and score whoever takes them. Settled jobs are archived over time.
 */
export const job = pgTable(
  "job",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    kindVersion: integer("kind_version").notNull(),
    // 1 facts from text · 2 photo · 3 judgement · 4 investigation (agents)
    level: integer("level").notNull(),
    subjectKind: text("subject_kind").notNull(),
    subjectId: uuid("subject_id").notNull(),
    input: jsonb("input").notNull(),
    copies: integer("copies").notNull().default(1),
    priority: integer("priority").notNull().default(0),
    status: text("status").notNull().default("open"),
    isTest: boolean("is_test").notNull().default(false),
    expected: jsonb("expected"),
    createdAt,
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (table) => [
    index("job_open_idx").on(table.status, table.level, table.priority),
    check("job_status_check", oneOf("status", JOB_STATUSES)),
    check("job_subject_check", oneOf("subject_kind", SUBJECTS)),
    check("job_level_check", sql`${table.level} between 1 and 4`),
  ],
);

/** One contributor's turn at a job: claimed, then answered or expired. Accepted answers become annotations. */
export const assignment = pgTable(
  "assignment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => job.id, { onDelete: "cascade" }),
    contributorId: uuid("contributor_id")
      .notNull()
      .references(() => contributor.id, { onDelete: "cascade" }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    result: jsonb("result"),
    // Null until the job settles: did this answer agree with the settled one (or the test's known answer)?
    accepted: boolean("accepted"),
  },
  (table) => [
    uniqueIndex("assignment_job_contributor_idx").on(table.jobId, table.contributorId),
    index("assignment_expiry_idx").on(table.submittedAt, table.expiresAt),
  ],
);

/**
 * Listings set aside to measure workers against: a draft answer (from an agent) that a person
 * checks, and the checked answer, which is what a model's are compared with. Answers follow the
 * extract-facts format, so "no category" is an answer too. A set is named, so a new one can be
 * drawn without losing the old.
 */
export const benchmark = pgTable(
  "benchmark",
  {
    name: text("name").notNull(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listing.id, { onDelete: "cascade" }),
    draft: jsonb("draft"),
    answer: jsonb("answer"),
    checkedById: uuid("checked_by_id").references(() => contributor.id, { onDelete: "set null" }),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.name, table.listingId] })],
);

/** A published catalog file: its format, the rules that resolved it, its fingerprint and counts. */
export const catalogBuild = pgTable("catalog_build", {
  id: uuid("id").primaryKey().defaultRandom(),
  formatVersion: integer("format_version").notNull(),
  resolverVersion: integer("resolver_version").notNull(),
  sha256: text("sha256").notNull(),
  url: text("url"),
  counts: jsonb("counts").notNull(),
  builtAt: timestamp("built_at", { withTimezone: true }).notNull().defaultNow(),
  // Set once the file's bytes are stored (catalog_chunk) for the hub to serve.
  publishedAt: timestamp("published_at", { withTimezone: true }),
});

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

/**
 * A published build's file, in pieces of a few MB so it can be served without holding it whole.
 * Only the latest builds keep theirs.
 */
export const catalogChunk = pgTable(
  "catalog_chunk",
  {
    buildId: uuid("build_id")
      .notNull()
      .references(() => catalogBuild.id, { onDelete: "cascade" }),
    n: integer("n").notNull(),
    bytes: bytea("bytes").notNull(),
  },
  (table) => [primaryKey({ columns: [table.buildId, table.n] })],
);
