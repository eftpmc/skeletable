import { readFile, writeFile } from "node:fs/promises";
import { parse } from "node-html-parser";
import { readStorefront } from "../src/catalog/connectors/storefront.js";
import { pageConnector } from "../src/catalog/connectors/index.js";

const input = process.argv[2] ?? "docs/audits/2026-10-26-coverage.json";
const audit = JSON.parse(await readFile(input, "utf8"));
const results = [];
for (const row of audit.results) {
  // Do not retry access/rate-limit failures. Inspect only accessible sites with zero discoveries.
  if (row.state !== "open" || row.discoveries.some((d: { productUrls: string[]; observation: { state: string } }) =>
    d.productUrls.length || d.observation.state !== "open")) continue;
  const { page, observation } = await readStorefront(row.finalUrl, { timeoutMs: 8000 });
  const root = parse(page.body.toString("utf8"));
  const links = [...new Set(root.querySelectorAll("a[href]").flatMap((a) => {
    try {
      const url = new URL(a.getAttribute("href")!, page.url);
      return url.origin === new URL(page.url).origin ? [url.toString()] : [];
    } catch { return []; }
  }))];
  // Diagnostic only: broadens URL patterns without changing the measured baseline.
  const candidates = links.filter((u) => /\/(?:product|products|p|shop|en-us\/p)\/|\.html(?:\?|$)/i.test(u)).slice(0, 8);
  const reads = [];
  if (observation.state === "open") {
    for (const url of candidates.slice(0, 2)) reads.push({ url, ...await pageConnector.readProduct(url, { timeoutMs: 8000 }) });
  }
  const result = { name: row.name, url: page.url, observation, status: page.status,
    title: root.querySelector("title")?.text, headings: root.querySelectorAll("h1").map((e) => e.text).slice(0, 2),
    linkCount: links.length, linkExamples: links.slice(0, 12), candidates, reads };
  results.push(result);
  console.log(JSON.stringify(result));
}
const output = process.argv[3] ?? input.replace(/\.json$/, "-diagnostics.json");
if (output === input) throw new Error("Diagnostics output must differ from the source audit");
await writeFile(output, JSON.stringify(results, null, 2));
