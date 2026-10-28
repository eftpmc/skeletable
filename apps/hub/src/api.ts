import { createHash, randomBytes } from "node:crypto";
import { type HubDb, schema } from "@skeleton/hub-db";
import { eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { CATALOG_LICENCE } from "@skeleton/formats";
import { contributorId } from "./contributors.js";
import { benchmarkItems, recordCheck } from "./benchmark.js";
import { claimJob, JobError, submitAnswer } from "./jobs.js";
import { decideProposal, pendingProposals } from "./proposals.js";
import type { CrawlOptions } from "./engine/crawl.js";
import { clientAddress, rateLimit } from "./limits.js";
import { handleMcp } from "./mcp.js";
import { loadPhotoVectors, photosToEmbed } from "./photos.js";
import { buildStream, latestPublished } from "./publish.js";
import { curatePage } from "./curate-page.js";
import { reviewPage } from "./review-page.js";
import { applyForRole, canCurate, decideApplication, pendingApplications, RoleError, whoIs } from "./roles.js";

const { contributor } = schema;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Give a contributor a new token (replacing any old one). Only its hash is kept. */
export async function issueToken(db: HubDb, handle: string, kind: (typeof schema.CONTRIBUTOR_KINDS)[number]): Promise<string> {
  const id = await contributorId(db, handle, kind);
  const token = `hub_${randomBytes(24).toString("base64url")}`;
  await db.update(contributor).set({ tokenHash: hashToken(token) }).where(eq(contributor.id, id));
  return token;
}

const claimSchema = z.object({ kinds: z.array(z.string()).optional(), levels: z.array(z.number().int().min(1).max(4)).optional() });
const answerSchema = z.object({ answer: z.unknown(), model: z.string().max(200).optional(), promptVersion: z.string().max(100).optional() });

/**
 * The hub's API for contributors: claim a job, send its answer. Every call carries the
 * contributor's token as a bearer token; nothing here reads or returns anyone's personal data.
 */
export function hubApi(db: HubDb, options: { crawl?: CrawlOptions } = {}) {
  const app = new Hono<{ Variables: { contributorId: string } }>();
  // The checking page itself holds nothing private; it asks for the person's token to call the API.
  // Public downloads, per address; calls with a token, per address before the token is checked (so a
  // bad token costs the caller) and per contributor after.
  app.use("/catalog/*", rateLimit({ windowMs: 60_000, max: 30, key: clientAddress }));
  for (const path of ["/api/*", "/mcp"]) {
    app.use(path, bodyLimit({ maxSize: 8 * 1024 * 1024 }));
    app.use(path, rateLimit({ windowMs: 60_000, max: 600, key: clientAddress }));
  }
  app.get("/review/:name", (c) => c.html(reviewPage(c.req.param("name"))));
  app.get("/curate", (c) => c.html(curatePage()));
  // The catalog is open data (ODbL): its latest build, and the hash an app checks before downloading.
  app.get("/catalog/latest.json", async (c) => {
    const build = await latestPublished(db);
    return build ? c.json({ ...build, file: "/catalog/latest.jsonl.gz", licence: CATALOG_LICENCE }) : c.json({ error: "no catalog published yet" }, 404);
  });
  app.get("/catalog/latest.jsonl.gz.sha256", async (c) => {
    const build = await latestPublished(db);
    return build ? c.text(`${build.sha256}
`) : c.text("no catalog published yet", 404);
  });
  app.get("/catalog/latest.jsonl.gz", async (c) => {
    const build = await latestPublished(db);
    if (!build) return c.text("no catalog published yet", 404);
    return new Response(buildStream(db, build.id), {
      headers: { "content-type": "application/gzip", "content-disposition": `attachment; filename="skeleton-catalog-${build.id}.jsonl.gz"`, etag: `"${build.sha256}"` },
    });
  });
  const auth = async (c: Context<{ Variables: { contributorId: string } }>, next: () => Promise<void>) => {
    const token = c.req.header("authorization")?.match(/^Bearer (.+)$/)?.[1];
    const [found] = token ? await db.select({ id: contributor.id }).from(contributor).where(eq(contributor.tokenHash, hashToken(token))) : [];
    if (!found) return c.json({ error: "unauthorized" }, 401);
    c.set("contributorId", found.id);
    await next();
  };
  const perContributor = rateLimit({ windowMs: 60_000, max: 300, key: (c) => c.get("contributorId") as string });
  app.use("/api/*", auth, perContributor);
  app.use("/mcp", auth, perContributor);
  // Contributors' own agents, over MCP's Streamable HTTP with the same bearer token.
  app.all("/mcp", (c) => handleMcp(db, c.get("contributorId"), c.req.raw, options));
  app.post("/api/jobs/claim", async (c) => {
    const can = claimSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!can.success) return c.json({ error: "invalid request" }, 400);
    const claimed = await claimJob(db, c.get("contributorId"), can.data);
    return claimed ? c.json(claimed) : c.body(null, 204);
  });
  app.post("/api/assignments/:id/answer", async (c) => {
    const body = answerSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid request" }, 400);
    try {
      return c.json(await submitAnswer(db, c.req.param("id"), c.get("contributorId"), body.data));
    } catch (error) {
      if (error instanceof JobError) return c.json({ error: error.message }, error.status);
      throw error;
    }
  });
  // A benchmark's answers are what everyone is scored against, so only curators see them.
  app.get("/api/benchmark/:name", async (c) => {
    if (!canCurate((await whoIs(db, c.get("contributorId")))?.role)) return c.json({ error: "checking a benchmark takes a curator's role" }, 403);
    return c.json(await benchmarkItems(db, c.req.param("name")));
  });
  app.put("/api/benchmark/:name/:listingId", async (c) => {
    const who = await whoIs(db, c.get("contributorId"));
    if (who?.kind !== "person" || !canCurate(who.role)) return c.json({ error: "checking a benchmark takes a curator's role" }, 403);
    try {
      return c.json(await recordCheck(db, c.req.param("name"), c.req.param("listingId"), c.get("contributorId"), await c.req.json()));
    } catch (error) {
      return c.json({ error: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "invalid" }, 422);
    }
  });
  // Photo vectors are trusted as given, so only curators' and the owner's machines may send them.
  app.get("/api/photos/todo", (c) =>
    roleCall(c, async () => {
      if (!canCurate((await whoIs(db, c.get("contributorId")))?.role)) throw new RoleError(403, "sending photo vectors takes a curator's role");
      const limit = Math.min(Math.max(Number(c.req.query("limit")) || 500, 1), 2000);
      return photosToEmbed(db, limit);
    }),
  );
  app.post("/api/photos", (c) =>
    roleCall(c, async () => {
      if (!canCurate((await whoIs(db, c.get("contributorId")))?.role)) throw new RoleError(403, "sending photo vectors takes a curator's role");
      const body = z.object({ lines: z.array(z.string().max(20_000)).max(2000) }).safeParse(await c.req.json().catch(() => null));
      if (!body.success) throw new RoleError(422, "send { lines: [...] }, as embed/photos.py writes them");
      return loadPhotoVectors(db, body.data.lines);
    }),
  );
  // Proposals wait for a curator: listed with what the hub read, then approved or rejected in one call.
  const curator = async (c: Context<{ Variables: { contributorId: string } }>) => {
    if (!canCurate((await whoIs(db, c.get("contributorId")))?.role)) throw new RoleError(403, "deciding on proposals takes a curator's role");
  };
  app.get("/api/proposals", (c) =>
    roleCall(c, async () => {
      await curator(c);
      return pendingProposals(db);
    }),
  );
  app.post("/api/proposals/:id/decision", (c) =>
    roleCall(c, async () => {
      await curator(c);
      const body = z.object({ approve: z.boolean() }).safeParse(await c.req.json().catch(() => null));
      if (!body.success) throw new RoleError(422, "send { approve: true } or { approve: false }");
      const id = z.uuid().safeParse(c.req.param("id"));
      const decided = id.success ? await decideProposal(db, c.get("contributorId"), id.data, body.data.approve) : null;
      if (!decided) throw new RoleError(404, "no proposal with that id is waiting");
      return decided;
    }),
  );
  app.get("/api/me", async (c) => c.json(await whoIs(db, c.get("contributorId"))));
  app.post("/api/applications", (c) => roleCall(c, async () => applyForRole(db, c.get("contributorId"), await c.req.json().catch(() => null))));
  app.get("/api/applications", (c) =>
    roleCall(c, async () => {
      if ((await whoIs(db, c.get("contributorId")))?.role !== "owner") throw new RoleError(403, "only the owner sees requests");
      return pendingApplications(db);
    }),
  );
  app.post("/api/applications/:id/decision", (c) =>
    roleCall(c, async () => {
      const body = z.object({ approve: z.boolean() }).safeParse(await c.req.json().catch(() => null));
      if (!body.success) throw new RoleError(422, "send { approve: true } or { approve: false }");
      const id = z.uuid().safeParse(c.req.param("id"));
      if (!id.success) throw new RoleError(404, "no request waiting with that id");
      return decideApplication(db, c.get("contributorId"), id.data, body.data.approve);
    }),
  );
  return app;
}

async function roleCall(c: Context, run: () => Promise<unknown>) {
  try {
    return c.json(await run());
  } catch (error) {
    if (error instanceof RoleError) return c.json({ error: error.message }, error.status);
    throw error;
  }
}
