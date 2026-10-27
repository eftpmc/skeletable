import { type CategoryId, type Department, catalogCategories, categoryLabel } from "@closet/shared";
import { type EnqueuedTaskPromise, Meilisearch, MeilisearchApiError, type Settings } from "meilisearch";

/** One catalog product as the search index holds it. */
export type IndexedItem = {
  id: string;
  brandId: string;
  brandName: string;
  title: string | null;
  priceUsd: number | null;
  category: CategoryId;
  categoryLabel: string;
  group: string;
  department: Department;
  imageUrl: string;
  productUrl: string;
  quality: number;
  position: number;
};

const groupOf = new Map<string, string>(catalogCategories.map((c) => [c.id, c.group]));

export function toIndexed(item: Omit<IndexedItem, "categoryLabel" | "group">): IndexedItem {
  return { ...item, categoryLabel: categoryLabel(item.category), group: groupOf.get(item.category) ?? "" };
}

/**
 * Brand and title count most, then the category's name ("shoes" finds loafers). Every word must
 * match, allowing for typos in longer ones; among equal matches, better brands and each brand's own
 * order (newest, in stock) come first.
 */
const SETTINGS: Settings = {
  searchableAttributes: ["brandName", "title", "categoryLabel"],
  filterableAttributes: ["department", "category", "group", "brandId", "priceUsd"],
  sortableAttributes: ["priceUsd"],
  rankingRules: ["words", "typo", "proximity", "attribute", "sort", "exactness", "quality:desc", "position:asc"],
};

/** Waits for a Meilisearch task and fails loudly if it did. */
async function done(task: EnqueuedTaskPromise, timeout = 60_000) {
  const result = await task.waitTask({ timeout });
  if (result.status !== "succeeded") throw new Error(`search index task ${result.type} ${result.status}: ${result.error?.message ?? ""}`);
  return result;
}

/**
 * The catalog's text search, in Meilisearch. Postgres stays the source of truth; this is a copy the
 * server rebuilds from it (after a catalog import, or when the copy's count is off), so losing it
 * loses nothing.
 */
export class CatalogIndex {
  private client: Meilisearch;

  constructor(host: string, apiKey: string | undefined, private readonly name: string) {
    this.client = new Meilisearch({ host, apiKey });
  }

  /** How many products the index holds; null when it doesn't exist yet. */
  async count(): Promise<number | null> {
    try {
      return (await this.client.index(this.name).getStats()).numberOfDocuments;
    } catch (error) {
      if (error instanceof MeilisearchApiError && error.cause?.code === "index_not_found") return null;
      throw error;
    }
  }

  /** Replace everything with these products: built aside and swapped in, so search never sees half an index. */
  async replace(items: IndexedItem[]) {
    const next = `${this.name}_next`;
    await this.client.deleteIndexIfExists(next);
    await done(this.client.createIndex(next, { primaryKey: "id" }));
    const index = this.client.index<IndexedItem>(next);
    await done(index.updateSettings(SETTINGS));
    for (const task of index.addDocumentsInBatches(items, 5000)) await done(task, 300_000);
    if ((await this.count()) === null) await done(this.client.createIndex(this.name, { primaryKey: "id" }));
    await done(this.client.swapIndexes([{ indexes: [this.name, next], rename: false }]));
    await done(this.client.deleteIndex(next));
  }

  /** Products matching every word of the query, on the given departments, without the hidden categories. */
  async search(q: string, options: { departments: readonly Department[]; hidden: readonly CategoryId[]; limit: number }): Promise<IndexedItem[]> {
    const filter = [`department IN [${options.departments.map((d) => `"${d}"`).join(", ")}]`];
    if (options.hidden.length) filter.push(`category NOT IN [${options.hidden.map((c) => `"${c}"`).join(", ")}]`);
    const result = await this.client.index<IndexedItem>(this.name).search(q, { filter, limit: options.limit, matchingStrategy: "all" });
    return result.hits;
  }

  /** Remove the index entirely (tests clean up after themselves). */
  async drop() {
    await this.client.deleteIndexIfExists(this.name);
  }
}
