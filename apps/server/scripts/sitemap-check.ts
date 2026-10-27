// Usage: node --import ./node_modules/tsx/dist/loader.mjs scripts/sitemap-check.ts https://store.example/ ...
import { sitemapConnector } from "../src/catalog/connectors/index.js";

// Quick live check of the sitemap connector: discovery plus two product reads per store.
const sites = process.argv.slice(2);
const options = { timeoutMs: 8000 };
for (const site of sites) {
  const started = Date.now();
  const found = await sitemapConnector.discover(site, options);
  const reads = [];
  for (const url of found.productUrls.slice(0, 2)) {
    const read = await sitemapConnector.readProduct(url, options);
    reads.push({ url, state: read.observation.state, title: read.product?.title ?? null, priceCents: read.product?.priceCents ?? null, currency: read.product?.currency ?? null });
  }
  console.log(JSON.stringify({ site, state: found.observation.state, via: found.via, discovered: found.productUrls.length, reads, ms: Date.now() - started }));
}
