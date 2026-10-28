import { type HubDb, schema } from "@skeleton/hub-db";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

const { application, contributor } = schema;

export type Role = (typeof schema.ROLES)[number];

export class RoleError extends Error {
  constructor(
    readonly status: 403 | 404 | 409 | 422,
    message: string,
  ) {
    super(message);
  }
}

export const applySchema = z.object({ role: z.literal("curator"), note: z.string().trim().min(20).max(2000) });

export async function whoIs(db: HubDb, id: string) {
  const [who] = await db
    .select({ id: contributor.id, handle: contributor.handle, kind: contributor.kind, role: contributor.role, trust: contributor.trust })
    .from(contributor)
    .where(eq(contributor.id, id));
  return who ?? null;
}

/** Curators and the owner check and correct directly; everyone else's answers wait for agreement. */
export const canCurate = (role: string | undefined) => role === "curator" || role === "owner";

/**
 * How a contributor's direct answer ranks: a person holding a curator's role ranks as a person, and
 * outranks every model; anyone else ranks no higher than an agent, however they call in.
 */
export const directMethod = (who: { kind: string; role: string } | null) => (who?.kind === "person" && canCurate(who.role) ? "person" : "agent");

/** Ask for the curator's role. Only people may, and only one request at a time. */
export async function applyForRole(db: HubDb, contributorId: string, body: unknown) {
  const who = await whoIs(db, contributorId);
  if (who?.kind !== "person") throw new RoleError(403, "only a person can apply for a role");
  if (canCurate(who.role)) throw new RoleError(409, "you already have that role");
  const parsed = applySchema.safeParse(body);
  if (!parsed.success) throw new RoleError(422, "say in a sentence or two (20 to 2,000 characters) what you'd check");
  const [made] = await db
    .insert(application)
    .values({ contributorId, role: parsed.data.role, note: parsed.data.note })
    .onConflictDoNothing()
    .returning({ id: application.id, status: application.status });
  if (!made) throw new RoleError(409, "you already have a request waiting");
  return made;
}

export async function pendingApplications(db: HubDb) {
  return db
    .select({ id: application.id, handle: contributor.handle, trust: contributor.trust, role: application.role, note: application.note, createdAt: application.createdAt })
    .from(application)
    .innerJoin(contributor, eq(contributor.id, application.contributorId))
    .where(eq(application.status, "pending"))
    .orderBy(desc(application.createdAt));
}

/** The owner approves or declines a request; approving grants the role. */
export async function decideApplication(db: HubDb, ownerId: string, applicationId: string, approve: boolean) {
  const owner = await whoIs(db, ownerId);
  if (owner?.role !== "owner") throw new RoleError(403, "only the owner decides on roles");
  return db.transaction(async (tx) => {
    const [decided] = await tx
      .update(application)
      .set({ status: approve ? "approved" : "declined", decidedById: ownerId, decidedAt: new Date() })
      .where(and(eq(application.id, applicationId), eq(application.status, "pending")))
      .returning({ contributorId: application.contributorId, role: application.role, status: application.status });
    if (!decided) throw new RoleError(404, "no request waiting with that id");
    if (approve) await tx.update(contributor).set({ role: decided.role }).where(eq(contributor.id, decided.contributorId));
    return decided;
  });
}

/** Set a role outright, from the command line: how the first owner is made, and how a role is taken away. */
export async function setRole(db: HubDb, handle: string, role: Role) {
  const done = await db.update(contributor).set({ role }).where(eq(contributor.handle, handle)).returning({ id: contributor.id });
  if (!done.length) throw new Error(`no contributor called ${handle}`);
}
