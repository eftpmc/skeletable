import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { regressions, score, type Report } from "./score.js";

const manifest = fileURLToPath(new URL("./corpus.json", import.meta.url));
const report = await score(manifest);
for (const key of ["standard", "standard/development", "standard/holdout", "recipe", "recipe/development", "recipe/holdout"]) {
  const group = report.groups[key]!;
  console.log(`${key}: ${group.correct}/${group.total} labelled fields correct`);
}
console.log(`${report.cases} snapshots, ${report.sites} sites, ${report.nonShopifyProductSites} non-Shopify product sites`);
for (const check of report.checks.filter((c) => !c.correct)) console.log(`MISS ${check.id}/${check.mode}/${check.field}: expected ${JSON.stringify(check.expected)}, got ${JSON.stringify(check.actual)}`);
const args = process.argv.slice(2);
const out = args.indexOf("--out");
if (out !== -1) {
  if (!args[out + 1]) throw new Error("--out requires a path");
  await writeFile(args[out + 1]!, JSON.stringify(report, null, 2) + "\n");
}
if (args.includes("--check")) {
  const baseline = JSON.parse(await readFile(new URL("./baseline.json", import.meta.url), "utf8")) as Report;
  const failed = regressions(baseline, report);
  if (failed.length) { console.error("Regressions:", failed.join(", ")); process.exitCode = 1; }
  else console.log("No previously correct field regressed.");
}
