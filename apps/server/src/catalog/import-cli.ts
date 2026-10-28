// Load a catalog file the hub built: tsx src/catalog/import-cli.ts <catalog.jsonl.gz | https URL>
import { createDb, runMigrations } from "@skeleton/db";
import { importPackIfNew } from "./pack.js";
import { CatalogIndex } from "./search-index.js";
import { CatalogService } from "./service.js";

const [file] = process.argv.slice(2);
const url = process.env.DATABASE_URL;
if (!file || !url) {
  console.error("Usage: DATABASE_URL=… tsx src/catalog/import-cli.ts <catalog.jsonl.gz | https URL>");
  process.exit(1);
}
await runMigrations(url);
const { db, close } = createDb(url);
try {
  console.log(await importPackIfNew(db, file));
  // The search index reads from the database, so rebuild it now (MEILI_URL and MEILI_MASTER_KEY, as the server's).
  const index = new CatalogIndex(process.env.MEILI_URL ?? "http://localhost:7700", process.env.MEILI_MASTER_KEY, process.env.MEILI_INDEX ?? "catalog_items");
  console.log("search index rebuilt:", await new CatalogService(db, index).reindex(), "products");
} finally {
  await close();
}
