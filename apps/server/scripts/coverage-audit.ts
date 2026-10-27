import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname } from "node:path";
import { pageConnector, shopifyConnector } from "../src/catalog/connectors/index.js";
import { readStorefront } from "../src/catalog/connectors/storefront.js";
import { safeFetch } from "../src/net/safe-fetch.js";

// Purposeful compatibility sample, not a probability sample or a production seed list.
const sample = [
  ["Uniqlo", "clothing", "https://www.uniqlo.com/us/en/"],
  ["Zara", "clothing", "https://www.zara.com/us/"],
  ["H&M", "clothing", "https://www2.hm.com/en_us/index.html"],
  ["Patagonia", "clothing", "https://www.patagonia.com/"],
  ["Kith", "clothing", "https://kith.com/"],
  ["Supreme", "clothing", "https://us.supreme.com/"],
  ["Palace", "clothing", "https://shop-usa.palaceskateboards.com/"],
  ["Noah", "clothing", "https://noahny.com/"],
  ["Best Buy", "electronics", "https://www.bestbuy.com/"],
  ["Newegg", "electronics", "https://www.newegg.com/"],
  ["B&H", "electronics", "https://www.bhphotovideo.com/"],
  ["Framework", "electronics", "https://frame.work/"],
  ["Adafruit", "electronics", "https://www.adafruit.com/"],
  ["IKEA", "home", "https://www.ikea.com/us/en/"],
  ["Wayfair", "home", "https://www.wayfair.com/"],
  ["Article", "home", "https://www.article.com/"],
  ["Brooklinen", "home", "https://www.brooklinen.com/"],
  ["Schoolhouse", "home", "https://www.schoolhouse.com/"],
  ["eBay", "resale", "https://www.ebay.com/"],
  ["Etsy", "resale", "https://www.etsy.com/"],
  ["Grailed", "resale", "https://www.grailed.com/"],
  ["Depop", "resale", "https://www.depop.com/"],
  ["Back Market", "resale", "https://www.backmarket.com/en-us"],
  ["ThredUp", "resale", "https://www.thredup.com/"],
] as const;

const options = { timeoutMs: 8000, maxBytes: 5 * 1024 * 1024 };
const out = process.argv[2] ?? `docs/audits/${new Date().toISOString().replace(/[:.]/g, "-")}-coverage.json`;
const results: unknown[] = [];
const startedAt = new Date().toISOString();

async function audit([name, category, site]: typeof sample[number]) {
  const started = Date.now();
  try {
    const { page, observation } = await readStorefront(site, options);
    const html = page.body.toString("utf8");
    const shopifySignal = /cdn\.shopify\.com|Shopify\.shop|\/cdn\/shop\//.test(html);
    const base = {
      name, category, site, checkedAt: observation.checkedAt, finalUrl: page.url,
      status: page.status, state: observation.state, reason: observation.reason,
      bytes: page.body.length, sha256: createHash("sha256").update(page.body).digest("hex"),
      shopifySignal,
    };
    if (observation.state !== "open") return { ...base, discoveries: [], reads: [], elapsedMs: Date.now() - started };
    const discoveries = [];
    const generic = await pageConnector.discover(site, options);
    discoveries.push({ connector: "page", ...generic });
    if (shopifySignal) discoveries.push({ connector: "shopify", ...await shopifyConnector.discover(site, options) });
    // Prefer the platform feed when available, so homepage noise doesn't dominate product checks.
    const urls = [...new Set([...discoveries].reverse().flatMap((d) => d.productUrls))].slice(0, 2);
    const reads = [];
    for (const url of urls) {
      const read = await pageConnector.readProduct(url, options);
      reads.push({ url, ...read });
    }
    // A single bounded robots read provides discovery leads, not a crawl or permission conclusion.
    let sitemapHints: string[] = [];
    try {
      const robots = await safeFetch(new URL("/robots.txt", page.url).toString(), { ...options, maxBytes: 256_000 });
      sitemapHints = [...robots.body.toString("utf8").matchAll(/^sitemap:\s*(https?:\/\/\S+)/gim)].map((m) => m[1]!).slice(0, 5);
    } catch { /* An unavailable robots file doesn't establish sitemap absence. */ }
    return { ...base, discoveries, reads, sitemapHints, elapsedMs: Date.now() - started };
  } catch (error) {
    return { name, category, site, checkedAt: new Date().toISOString(), state: "fetch_failed",
      error: error instanceof Error ? error.message : String(error), discoveries: [], reads: [], elapsedMs: Date.now() - started };
  }
}

await mkdir(dirname(out), { recursive: true });
let next = 0;
await Promise.all(Array.from({ length: 3 }, async () => {
  while (next < sample.length) {
    const row = sample[next++]!;
    const result = await audit(row);
    results.push(result);
    console.log(JSON.stringify(result));
  }
}));
await writeFile(out, JSON.stringify({ startedAt, updatedAt: new Date().toISOString(), sampleSize: sample.length, results }, null, 2));
