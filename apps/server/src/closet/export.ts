import { type Db, schema } from "@closet/db";
import { eq } from "drizzle-orm";
import { zipSync } from "fflate";
import type { Storage } from "../storage.js";
import { listBrandFits, listItems, mediaKey } from "./service.js";

/** Everything a user has, as a zip: closet.json plus the full-size images. */
export async function exportUserData(db: Db, storage: Storage, user: { id: string; name: string; email: string }) {
  const [items, brandFits, wears] = await Promise.all([
    listItems(db, user.id),
    listBrandFits(db, user.id),
    db
      .select({ itemId: schema.wearLog.itemId, wornOn: schema.wearLog.wornOn })
      .from(schema.wearLog)
      .where(eq(schema.wearLog.userId, user.id)),
  ]);

  const wearsByItem = new Map<string, string[]>();
  for (const wear of wears) {
    wearsByItem.set(wear.itemId, [...(wearsByItem.get(wear.itemId) ?? []), wear.wornOn]);
  }

  const files: Record<string, Uint8Array> = {};
  const exportedItems = [];
  for (const entry of items) {
    const images: string[] = [];
    for (const ref of entry.media) {
      const data = await storage.get(mediaKey(ref.id, "full"));
      if (!data) continue;
      const name = `media/${ref.id}.webp`;
      files[name] = data;
      images.push(name);
    }
    const { media: _media, ...rest } = entry;
    exportedItems.push({ ...rest, images, wornOn: (wearsByItem.get(entry.id) ?? []).sort() });
  }

  const closet = {
    format: "closet-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    user: { name: user.name, email: user.email },
    brandFits,
    items: exportedItems,
  };
  files["closet.json"] = new TextEncoder().encode(JSON.stringify(closet, null, 2));

  // Images are already compressed; store them as-is.
  return zipSync(
    Object.fromEntries(
      Object.entries(files).map(([name, data]) => [name, [data, { level: name.endsWith(".json") ? 6 : 0 }]]),
    ),
  );
}
