import { type Db, schema } from "@skeleton/db";
import { type CategoryId, type Preferences, type PreferencesInput, type ShopFor, categoryIds } from "@skeleton/shared";
import { eq } from "drizzle-orm";

const { userPreference } = schema;

const known = new Set<string>(categoryIds);

/** Someone's preferences, or the defaults (everything, no cap, nothing hidden) before they've set any. */
export async function readPreferences(db: Db, userId: string): Promise<Preferences> {
  const [row] = await db.select().from(userPreference).where(eq(userPreference.userId, userId));
  return {
    shopFor: (row?.shopFor as ShopFor | null) ?? null,
    priceMaxUsd: row?.priceMaxUsd ?? null,
    // A category the taxonomy no longer has is dropped rather than kept hidden forever.
    hiddenCategories: (row?.hiddenCategories ?? []).filter((c): c is CategoryId => known.has(c)),
  };
}

/** Change some preferences, leaving the rest as they are. */
export async function updatePreferences(db: Db, userId: string, input: PreferencesInput): Promise<Preferences> {
  const set = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
  if (input.hiddenCategories) set.hiddenCategories = [...new Set(input.hiddenCategories)];
  await db
    .insert(userPreference)
    .values({ userId, ...set })
    .onConflictDoUpdate({ target: userPreference.userId, set: Object.keys(set).length ? set : { userId } });
  return readPreferences(db, userId);
}
