import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { safeFetch } from "../src/net/safe-fetch.js";
import { isAccessoryFor, relevance } from "../src/search/normalize.js";

// Small diagnostic sample from the existing coverage audit, not a coverage estimate.
const checks = [
  { domain: "noahny.com", query: "jacket" },
  { domain: "kith.com", query: "New Balance 990" },
  { domain: "www.schoolhouse.com", query: "table lamp" },
];
const results = [];
for (const check of checks) {
  const url = new URL(`https://${check.domain}/search/suggest.json`);
  url.search = new URLSearchParams({ q: check.query, "resources[type]": "product", "resources[limit]": "10" }).toString();
  const started = Date.now();
  try {
    const response = await safeFetch(url.toString(), { accept: "application/json", timeoutMs: 6000, maxBytes: 1_000_000 });
    const data = JSON.parse(response.body.toString("utf8"));
    const products = data.resources?.results?.products;
    if (!Array.isArray(products)) throw new Error("Response has no product results array");
    results.push({ ...check, status: "ok", elapsedMs: Date.now() - started, candidates: products.map((p: { title: string; vendor?: string; url?: string; available?: boolean }) => ({ title: p.title, brand: p.vendor ?? null, url: p.url, available: p.available ?? null, score: relevance(check.query, p.title, p.vendor ?? null), accessory: isAccessoryFor(check.query, p.title) })) });
  } catch (error) {
    results.push({ ...check, status: "failed", elapsedMs: Date.now() - started, error: error instanceof Error ? error.message : String(error) });
  }
}
const report = { checkedAt: new Date().toISOString(), note: "Three public endpoint checks; no API keys, no model calls. Failure is not evidence of zero inventory.", results };
const output = process.argv[2] ?? "../../docs/audits/search-coverage.json";
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
