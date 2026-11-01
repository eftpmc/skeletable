// Tables from the command line: tsx src/cli.ts <command> <file>
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { validateTable, watchFileSchema, type WatchFile } from "./format.js";
import { coverage, sampleCells } from "./sample.js";
import { liveFetcher, verifyTable, watchTable } from "./verify.js";

const usage = `Usage: tables <command> <file>
  validate <file>                 the file's shape, and every number against its quote
  verify <file>                   open each source and look for every quote
  watch <file>                    see whether live quotes are still there, and save it beside the table
  sample <file> [count] [seed]    a repeatable draw of cells to check by hand`;

const [command, file, ...rest] = process.argv.slice(2);
if (!command || !file) {
  console.log(usage);
  process.exit(1);
}

const { table, problems } = validateTable(JSON.parse(await readFile(file, "utf8")));
if (!table || problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}

if (command === "validate") {
  const { filled, missing, share, kinds } = coverage(table);
  const sources = Object.entries(kinds).map(([kind, cells]) => `${cells} ${kind}`).join(", ");
  console.log(`${table.slug}: ${table.rows.length} rows, ${filled} cells filled, ${missing} missing (${(share * 100).toFixed(0)}%); ${sources}`);
} else if (command === "verify") {
  const checks = await verifyTable(table, liveFetcher());
  const count = (status: string) => checks.filter((c) => c.status === status).length;
  for (const check of checks.filter((c) => c.status !== "found")) {
    console.log(`${check.status}: ${check.row}.${check.column} ${check.source}${check.detail ? ` (${check.detail})` : ""}`);
  }
  const stale = new Map(checks.filter((c) => c.stale).map((c) => [c.source, c.stale]));
  for (const [source, mark] of stale) console.log(`old version? ${source} says "${mark}"`);
  console.log(`${checks.length} cells: ${count("found")} found, ${count("not-on-page")} not on page, ${count("unreadable")} unreadable, ${count("robots")} robots`);
} else if (command === "watch") {
  const path = join(dirname(file), "watch", `${table.slug}.json`);
  const before: WatchFile | undefined = await readFile(path, "utf8").then((text) => watchFileSchema.parse(JSON.parse(text)), () => undefined);
  const ran = new Date().toISOString().slice(0, 10);
  const watch = await watchTable(table, liveFetcher(), ran, before);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(watch, null, 2)}\n`);
  const entries = Object.entries(watch.cells);
  const count = (status: string) => entries.filter(([, entry]) => entry.status === status).length;
  for (const [key, entry] of entries.filter(([, e]) => !["found", "pinned"].includes(e.status))) console.log(`${entry.status}: ${key}`);
  console.log(`${entries.length} cells: ${count("found")} still there, ${count("pinned")} pinned, ${count("not-on-page")} gone, ${count("unreadable")} unreadable, ${count("robots")} robots`);
} else if (command === "sample") {
  console.log(JSON.stringify(sampleCells(table, Number(rest[0] ?? 20), Number(rest[1] ?? 1)), null, 2));
} else {
  console.error(usage);
  process.exit(1);
}
