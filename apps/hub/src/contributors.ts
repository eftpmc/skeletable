import { type HubDb, schema } from "@skeleton/hub-db";
import { eq } from "drizzle-orm";

const { contributor } = schema;

type Kind = (typeof schema.CONTRIBUTOR_KINDS)[number];

/** The id of the contributor with this handle, creating it the first time. */
export async function contributorId(db: HubDb, handle: string, kind: Kind): Promise<string> {
  const [found] = await db.select({ id: contributor.id }).from(contributor).where(eq(contributor.handle, handle));
  if (found) return found.id;
  const [created] = await db
    .insert(contributor)
    .values({ handle, kind })
    .onConflictDoUpdate({ target: contributor.handle, set: { handle } })
    .returning({ id: contributor.id });
  return created!.id;
}

// The hub's own work: detection, rules. Credited like anyone else's.
export const HUB = { handle: "hub", kind: "system" } as const;
