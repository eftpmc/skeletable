// Load the brand lab's export into the catalog: tsx src/catalog/import-cli.ts <catalog.jsonl>
import { readFileSync } from "node:fs";
import { createDb, runMigrations } from "@closet/db";
import { catalogRecordSchema, importCatalog } from "./import.js";
import { CatalogIndex } from "./search-index.js";
import { CatalogService } from "./service.js";

const [file] = process.argv.slice(2);
const url = process.env.DATABASE_URL;
if (!file || !url) {
  console.error("Usage: DATABASE_URL=… tsx src/catalog/import-cli.ts <catalog.jsonl>");
  process.exit(1);
}
const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
const records = lines.map((line, i) => {
  const parsed = catalogRecordSchema.safeParse(JSON.parse(line));
  if (!parsed.success) throw new Error(`line ${i + 1}: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`);
  return parsed.data;
});
await runMigrations(url);
const { db, close } = createDb(url);
try {
  console.log(await importCatalog(db, records));
  // The search index reads from the database, so rebuild it now (MEILI_URL and MEILI_MASTER_KEY, as the server's).
  const index = new CatalogIndex(process.env.MEILI_URL ?? "http://localhost:7700", process.env.MEILI_MASTER_KEY, process.env.MEILI_INDEX ?? "catalog_items");
  console.log("search index rebuilt:", await new CatalogService(db, index).reindex(), "products");
} finally {
  await close();
}
