import { currencyDigits, toMinorUnits } from "@skeleton/formats";
import { parse, type HTMLElement, type Node, NodeType } from "node-html-parser";
import { z } from "zod";

/**
 * Where one value can be found on a page: an element (by CSS selector, its text or an attribute), or
 * a path into JSON the page embeds for its own scripts (Next.js page state, `application/json`
 * blocks, JSON-LD). Data only: a recipe never carries code.
 */
const selectSource = z
  .object({
    select: z.string().min(1).max(240).describe("CSS selector matching exactly one element"),
    attribute: z.string().min(1).max(80).optional().describe("Read this attribute instead of the element's text, e.g. content or src"),
  })
  .strict();
const jsonSource = z
  .object({
    json: z
      .string()
      .min(1)
      .max(300)
      .regex(/^[^.\s]+(?:\.[^.\s]+)*$/)
      .describe("Dot path into embedded JSON, numbers for list items, e.g. props.pageProps.product.variants.0.price"),
    script: z.string().min(1).max(240).optional().describe("CSS selector of the <script> holding that JSON (default: every JSON script on the page, in order)"),
  })
  .strict();
export const sourceSchema = z.union([selectSource, jsonSource]);
export type Source = z.infer<typeof sourceSchema>;
export const collectionSchema = z.union([z.object({ select: z.string().min(1).max(240) }).strict(), jsonSource]);

/** One place, or several to try in order: the first that gives a usable value wins. */
export const ruleSchema = z.union([sourceSchema, z.array(sourceSchema).min(1).max(5)]);
export type Rule = z.infer<typeof ruleSchema>;

/** A page ready for picking values: its elements and the JSON its scripts embed. */
export type PageDoc = { root: HTMLElement; scripts: { element: HTMLElement; data: unknown }[] };

const JSON_SCRIPTS = 'script[type="application/json"], script[type="application/ld+json"], script#__NEXT_DATA__';

/** A parsed page and the JSON its scripts carry. */
export function pageDoc(root: HTMLElement): PageDoc {
  const scripts: PageDoc["scripts"] = [];
  for (const element of root.querySelectorAll(JSON_SCRIPTS)) {
    try {
      scripts.push({ element, data: JSON.parse(element.text) });
    } catch {
      // A script that isn't JSON is skipped, not fatal.
    }
  }
  return { root, scripts };
}

const HIDDEN = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT"]);

/** What an element shows: its text without any script or style inside it. */
function textOf(node: Node): string {
  if (node.nodeType === NodeType.TEXT_NODE) return node.text;
  if (node.nodeType !== NodeType.ELEMENT_NODE || HIDDEN.has((node as HTMLElement).tagName)) return "";
  return node.childNodes.map(textOf).join("");
}

export type Picked = string | number | boolean;

function walk(data: unknown, path: string): unknown {
  let value = data;
  for (const key of path.split(".")) {
    if (["__proto__", "prototype", "constructor"].includes(key)) return undefined;
    if (Array.isArray(value) && /^\d+$/.test(key)) value = value[Number(key)];
    else if (value && typeof value === "object" && !Array.isArray(value)) value = (value as Record<string, unknown>)[key];
    else return undefined;
  }
  return value;
}

/** Bounded variant rows, from scoped DOM elements or an explicit JSON array path. */
export function collectionDocs(doc: PageDoc, source: z.infer<typeof collectionSchema>): PageDoc[] {
  if ("select" in source) return doc.root.querySelectorAll(source.select).slice(0, 500).map(pageDoc);
  const selected = source.script ? new Set(doc.root.querySelectorAll(source.script)) : undefined;
  for (const script of doc.scripts) {
    if (selected && !selected.has(script.element)) continue;
    const values = walk(script.data, source.json);
    if (!Array.isArray(values)) continue;
    return values.slice(0, 500).filter((value) => value && typeof value === "object" && !Array.isArray(value)).map((item) => ({
      root: parse("<div></div>"), scripts: [{ element: script.element, data: { item } }],
    }));
  }
  return [];
}

function pickOne(doc: PageDoc, source: Source): { value?: Picked; issue?: string } {
  if ("json" in source) {
    let scripts = doc.scripts;
    if (source.script) {
      try {
        const wanted = new Set(doc.root.querySelectorAll(source.script));
        scripts = doc.scripts.filter((s) => wanted.has(s.element));
      } catch {
        return { issue: "the script selector isn't valid" };
      }
    }
    for (const { data } of scripts) {
      const value = walk(data, source.json);
      if (typeof value === "string" && value.trim()) return { value: value.replace(/\s+/g, " ").trim() };
      if (typeof value === "number" || typeof value === "boolean") return { value };
    }
    return { issue: `nothing at ${source.json}` };
  }
  let nodes: HTMLElement[];
  try {
    nodes = source.select === ":scope" ? [doc.root] : doc.root.querySelectorAll(source.select);
  } catch {
    return { issue: "the selector isn't valid" };
  }
  if (nodes.length !== 1) return { issue: `expected one element, found ${nodes.length}` };
  const raw = source.attribute ? nodes[0]!.getAttribute(source.attribute) : textOf(nodes[0]!);
  const value = raw?.replace(/\s+/g, " ").trim();
  return value ? { value } : { issue: "empty" };
}

/**
 * The first value a rule's places give that `accept` keeps. Every place that came up empty, or gave a
 * value `accept` refused, is reported, so a recipe that no longer fits its site says where.
 */
export function pick<T>(doc: PageDoc, rule: Rule, accept: (value: Picked, source: Source) => T | undefined): { value?: T; issues: string[] } {
  const issues: string[] = [];
  for (const source of Array.isArray(rule) ? rule : [rule]) {
    const { value, issue } = pickOne(doc, source);
    if (value === undefined) {
      issues.push(issue!);
      continue;
    }
    const kept = accept(value, source);
    if (kept !== undefined) return { value: kept, issues };
    issues.push(`"${String(value).slice(0, 80)}" isn't usable`);
  }
  return { issues };
}

/**
 * A price as a page shows it ("€1.234,50", "$ 98", "12 500 ¥") in the currency's minor units: the
 * last separator is the decimal point only when the right number of digits follows it.
 */
export function parsePrice(raw: string, currency: string, notation: "display" | "decimal" = "display"): number | undefined {
  // Machine-readable amounts use a decimal point irrespective of currency precision.
  // 10.9500 USD is 1095 cents, not 10950000. Display strings still allow grouping.
  if (notation === "decimal") return toMinorUnits(raw.trim(), currency);
  if (/-\s*[$€£¥]?\s*\d|\b(?:per|month|monthly|week|weekly|installments?)\b|\/\s*(?:mo|wk)/i.test(raw)) return undefined;
  const numbers = raw.replace(/[\s'\u00a0\u202f]/g, "").match(/\d[\d.,]*/g);
  if (numbers?.length !== 1) return undefined;
  const number = raw.replace(/[\s'\u00a0\u202f]/g, "").match(/\d[\d.,]*/)?.[0];
  if (!number) return undefined;
  const digits = currencyDigits(currency);
  const last = Math.max(number.lastIndexOf("."), number.lastIndexOf(","));
  const after = last >= 0 ? number.length - last - 1 : 0;
  const padded = after > digits && after !== 3 && /^0+$/.test(number.slice(last + 1 + digits));
  const decimal = last >= 0 && digits > 0 && after >= 1 && (after <= digits || padded);
  const whole = (decimal ? number.slice(0, last) : number).replace(/[.,]/g, "");
  return toMinorUnits(decimal ? `${whole}.${number.slice(last + 1)}` : whole, currency);
}
