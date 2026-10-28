import { createHash, randomBytes } from "node:crypto";
import { type HubDb, schema } from "@skeleton/hub-db";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { contributorId } from "./contributors.js";
import { claimJob, JobError, submitAnswer } from "./jobs.js";

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
export function hubApi(db: HubDb) {
  const app = new Hono<{ Variables: { contributorId: string } }>();
  app.use("/api/*", async (c, next) => {
    const token = c.req.header("authorization")?.match(/^Bearer (.+)$/)?.[1];
    const [found] = token ? await db.select({ id: contributor.id }).from(contributor).where(eq(contributor.tokenHash, hashToken(token))) : [];
    if (!found) return c.json({ error: "unauthorized" }, 401);
    c.set("contributorId", found.id);
    await next();
  });
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
  return app;
}
