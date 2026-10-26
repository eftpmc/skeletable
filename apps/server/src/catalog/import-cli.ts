// Load the brand lab's export into the catalog: tsx src/catalog/import-cli.ts <catalog.jsonl>
import { readFileSync } from "node:fs";
import { createDb, runMigrations } from "@closet/db";
import { catalogRecordSchema, importCatalog } from "./import.js";

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
} finally {
  await close();
}
