import { mkdir, writeFile } from "node:fs/promises";
import { parse } from "node-html-parser";
import { safeFetch } from "../src/net/safe-fetch.js";
import { parseProductPage } from "../src/closet/link-preview.js";
import { reviewedRecipes } from "../src/catalog/connectors/reviewed-recipes.js";
import { extractRecipe } from "../src/catalog/connectors/recipes.js";
import { validateRecipe, type Fixture } from "../src/catalog/connectors/repair.js";

// Expected values independently observed through browser accessibility snapshots on 2026-10-26.
const cases = [
  ["z2p9r5lpfqwv", "SHEEPSKIN FLYING JACKET BROWN", 189800],
  ["av1bal6eijz1", "PALACE AVIREX JACKET BLACK", 157000],
  ["9kzpdwhlbspn", "BETTY BOOP VARSITY JACKET BROWN", 54800],
] as const;
const fixtures: Fixture[] = [];
const reads = [];
for (const [id, title, priceCents] of cases) {
  const response = await safeFetch(`https://usa.palaceskateboards.com/products/${id}`, { timeoutMs: 8000 });
  const html = response.body.toString("utf8");
  const before = parseProductPage(html, response.url);
  const after = extractRecipe(html, response.url, reviewedRecipes[0]!);
  const header = parse(html).querySelector("#product-header");
  if (!header) throw new Error("Product header missing; do not overwrite regression fixtures");
  fixtures.push({ id, document: { url: response.url, html: header.outerHTML, status: response.status, transport: "http", observedAt: new Date().toISOString() },
    expected: { title, priceCents, currency: "USD", availability: "unknown", variants: [] } });
  reads.push({ url: response.url, before: { title: before.title, priceCents: before.priceCents, currency: before.currency }, after });
}
const validation = validateRecipe(reviewedRecipes[0]!, fixtures);
if (!validation.passed || reads.some((r) => !r.after.product)) throw new Error("Live comparison failed; inspect before updating fixtures");
await mkdir("apps/server/test/fixtures", { recursive: true });
await writeFile("apps/server/test/fixtures/palace-us.json", JSON.stringify(fixtures, null, 2));
await writeFile("docs/audits/2026-10-26-recipe-recovery.json", JSON.stringify({ kind: "live HTTP recovery, browser-verified expected title and price", reads, validation }, null, 2));
console.log(JSON.stringify({ recovered: reads.length, baselinePrices: reads.map((r) => r.before.priceCents), validated: validation.passed }));
