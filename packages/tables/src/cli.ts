// Tables from the command line: tsx src/cli.ts <command> <file>
import { readFile } from "node:fs/promises";
import { validateTable } from "./format.js";
import { coverage, sampleCells } from "./sample.js";
import { liveFetcher, verifyTable } from "./verify.js";

const usage = `Usage: tables <command> <file>
  validate <file>                 the file's shape, and every number against its quote
  verify <file>                   open each source and look for every quote
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
  const { filled, missing, share } = coverage(table);
  console.log(`${table.slug}: ${table.rows.length} rows, ${filled} cells filled, ${missing} missing (${(share * 100).toFixed(0)}%)`);
} else if (command === "verify") {
  const checks = await verifyTable(table, liveFetcher());
  const count = (status: string) => checks.filter((c) => c.status === status).length;
  for (const check of checks.filter((c) => c.status !== "found")) {
    console.log(`${check.status}: ${check.row}.${check.column} ${check.source}${check.detail ? ` (${check.detail})` : ""}`);
  }
  console.log(`${checks.length} cells: ${count("found")} found, ${count("not-on-page")} not on page, ${count("unreadable")} unreadable, ${count("robots")} robots`);
} else if (command === "sample") {
  console.log(JSON.stringify(sampleCells(table, Number(rest[0] ?? 20), Number(rest[1] ?? 1)), null, 2));
} else {
  console.error(usage);
  process.exit(1);
}
