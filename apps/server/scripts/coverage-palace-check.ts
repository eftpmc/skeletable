import { writeFile } from "node:fs/promises";
import { parse } from "node-html-parser";
import { readStorefront } from "../src/catalog/connectors/storefront.js";
import { parseProductPage } from "../src/closet/link-preview.js";

const url = "https://usa.palaceskateboards.com/products/z2p9r5lpfqwv";
const { page, observation } = await readStorefront(url, { timeoutMs: 8000 });
const root = parse(page.body.toString("utf8"));
root.querySelectorAll("script, style").forEach((el) => el.remove());
const result = {
  url, observation, status: page.status,
  rawDocumentContainsDisplayedPrice: /1,898/.test(root.text),
  rawDocumentContainsProductName: /SHEEPSKIN FLYING JACKET BROWN/.test(root.text),
  preview: parseProductPage(page.body.toString("utf8"), page.url),
};
await writeFile("docs/audits/2026-10-26-palace-check.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
