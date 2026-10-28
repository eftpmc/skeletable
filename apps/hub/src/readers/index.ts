import { recipeReader } from "./recipe.js";
import { shopifyReader } from "./shopify.js";
import { standardReader } from "./standard.js";
import type { Reader } from "./types.js";

export type { Detection, ReadContext, Reader } from "./types.js";

/**
 * The readers written so far, in the order detection tries them. Each matches a row in the hub's
 * reader table (packages/hub-db migrations); a reader not listed here stays disabled there.
 */
// Platform readers first (cheaper and richer where they fit), then any site's structured data.
export const readers: Reader[] = [shopifyReader, standardReader, recipeReader];

export const readerById = (id: string | null | undefined) => readers.find((r) => r.id === id) ?? null;
