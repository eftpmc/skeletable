import { parse } from "node-html-parser";
import { safeFetch } from "../src/net/safe-fetch.js";
const response = await safeFetch(process.argv[2]!);
const root = parse(response.body.toString("utf8"));
root.querySelectorAll("script, style, template").forEach((e) => e.remove());
console.log(JSON.stringify(root.querySelectorAll("[class], [id]").filter((e) =>
  /price|product-header|product-title|size-selector|variant/i.test(`${e.getAttribute("class")} ${e.getAttribute("id")}`) && e.text.length < 1000,
).slice(0, 30).map((e) => ({ tag: e.tagName, attributes: e.attributes, text: e.text.trim(), html: e.outerHTML.slice(0, 2500) })), null, 2));
