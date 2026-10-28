import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireProduct, type Document, type Transport } from "./acquisition.js";
import { RecipeStore } from "./recipe-store.js";
import { suggestRepairs, type Fixture } from "./repair.js";
import type { Recipe } from "./recipes.js";

export const demoRecipe: Recipe = {
  id: "demo-store", version: 1, origin: "https://store.example.com", pathPrefix: "/products/",
  title: { selector: "h1" }, price: { selector: ".legacy-price" }, currency: { constant: "USD" },
  variants: { selector: ".size", label: { selector: ":scope", attribute: "data-size" },
    stock: { field: { selector: ":scope", attribute: "data-stock" }, inStock: ["yes"], outOfStock: ["no"] } },
};
export function demoFixture(id: string, title: string, price: number, changed = false): Fixture {
  const html = `<h1>${title}</h1><div class="${changed ? "current-price" : "legacy-price current-price"}">$${price}</div>
    <div id="installment-price">$${price / 4}</div>
    <button class="size" data-size="M" data-stock="yes">M</button><button class="size" data-size="L" data-stock="no">L</button>`;
  return { id, document: { url: `https://store.example.com/products/${id}`, html, status: 200,
    observedAt: "2026-10-26T00:00:00.000Z", transport: "http" },
    expected: { title, priceCents: price * 100, currency: "USD", availability: "unknown", variants: [
      { label: "M", availability: "in_stock" }, { label: "L", availability: "out_of_stock" },
    ] } };
}
export const demoFixtures = () => [demoFixture("jacket", "Jacket", 200), demoFixture("shirt", "Shirt", 80), demoFixture("boots", "Boots", 160)];
export const documentTransport = (doc: Document): Transport => ({ async fetch() { return doc; } });

/** Offline end-to-end proof. Approval here is explicitly a simulated reviewer, never production. */
export async function runRepairDemo() {
  const directory = await mkdtemp(join(tmpdir(), "skeleton-repair-"));
  const store = new RecipeStore(join(directory, "registry.json"));
  const baseline = demoFixtures();
  await store.initialize(demoRecipe, baseline, "demo reviewer");
  const changed = demoFixture("jacket", "Jacket", 200, true);
  const before = await acquireProduct(changed.document.url, (await store.read()).active, {
    http: documentTransport(changed.document), previous: { product: baseline[0]!.expected!, observedAt: baseline[0]!.document.observedAt },
  });
  const regression = [...baseline, { ...changed, id: "changed-layout" }];
  const candidates = suggestRepairs(demoRecipe, changed.document);
  const proposals = [];
  for (const candidate of candidates) proposals.push(await store.propose(candidate, regression));
  const correct = proposals.find((p) => p.status === "pending");
  const incorrect = proposals.find((p) => p.status === "rejected");
  if (!correct || !incorrect) throw new Error("Demo must produce a passing repair and reject the installment candidate");
  const activeBeforeReview = (await store.read()).active.version;
  await store.approve(correct.id, regression, "demo reviewer");
  const after = await acquireProduct(changed.document.url, (await store.read()).active, { http: documentTransport(changed.document) });
  await store.rollback(1, "demo reviewer");
  const report = { kind: "synthetic repair demonstration", before, activeBeforeReview,
    proposals, after, rolledBackVersion: (await store.read()).active.version, registry: store.file };
  await writeFile(join(directory, "report.json"), JSON.stringify(report, null, 2));
  // Verify the durable registry can be read after all transitions.
  JSON.parse(await readFile(store.file, "utf8"));
  return report;
}
