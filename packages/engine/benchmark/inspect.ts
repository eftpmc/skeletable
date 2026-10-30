import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { parse } from "node-html-parser";

// Source inspection only: deliberately does not import the extraction engine.
for (const file of process.argv.slice(2)) {
  const root = parse(gunzipSync(await readFile(file)).toString("utf8"));
  console.log(`\n${file}`);
  console.log("TITLE", root.querySelector("title")?.text);
  console.log("H1", root.querySelectorAll("h1").map((n) => n.text.trim()));
  for (const script of root.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const walk = (value: unknown): void => {
        if (Array.isArray(value)) { value.forEach(walk); return; }
        if (!value || typeof value !== "object") return;
        const item = value as Record<string, unknown>;
        if (/Product|Book|VideoGame/.test(String(item["@type"]))) console.log("JSON-LD", JSON.stringify(Object.fromEntries(
          ["@type", "name", "brand", "sku", "mpn", "gtin", "gtin13", "isbn", "image", "offers", "hasVariant"].filter((key) => item[key] !== undefined).map((key) => [key, item[key]]))).slice(0, 10000));
        if (item["@graph"]) walk(item["@graph"]);
      };
      walk(JSON.parse(script.text));
    } catch { console.log("INVALID JSON-LD", script.text.slice(0, 100)); }
  }
  console.log("META", root.querySelectorAll('meta[property],meta[itemprop]').map((n) => n.outerHTML).join("\n").slice(0, 5000));
  console.log("PRICE/STOCK", root.querySelectorAll('[itemprop="price"], [itemprop="availability"], #product-price, .price, .stock, [data-price-amount]').map((n) => n.outerHTML.slice(0, 800)).slice(0, 16));
  console.log("PLATFORM", ["Shopify", "Magento", "wp-content", "demandware", "__NEXT_DATA__"].filter((signal) => root.toString().includes(signal)));
}
