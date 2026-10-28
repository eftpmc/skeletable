import { safeFetch, type SafeFetchOptions } from "./safe-fetch.js";
import { classifyStorefront, type StoreObservation } from "./storefront.js";
import { extractRecipe, type Recipe, type Extraction, type ExtractedProduct } from "./recipes.js";

export type Document = { url: string; html: string; status: number | null; observedAt: string; transport: "http" | "browser" };
export interface Transport { fetch(url: string): Promise<Document> }
export const httpTransport = (options: SafeFetchOptions = {}): Transport => ({
  async fetch(url) {
    const page = await safeFetch(url, { ...options, allowHttpErrors: true });
    return { url: page.url, html: page.body.toString("utf8"), status: page.status, observedAt: new Date().toISOString(), transport: "http" };
  },
});
export type Attempt = { transport: Document["transport"]; ms: number; observation?: StoreObservation; extraction?: Extraction; error?: string };
export type Acquisition = {
  status: "ok" | "store_closed" | "access_failed" | "repair_needed" | "suspicious_change";
  product: ExtractedProduct | null; previousRetained: boolean; observedAt: string | null;
  attempts: Attempt[]; browserRequested: boolean; costUsd: null;
};

export function observeDocument(doc: Document): StoreObservation {
  return { ...classifyStorefront({ url: doc.url, body: Buffer.from(doc.html), status: doc.status ?? 200, contentType: "text/html" }), checkedAt: doc.observedAt };
}

/** One fallback maximum. A real closure is never a reason to repair or escalate. */
export async function acquireProduct(url: string, recipe: Recipe, options: {
  http: Transport; browser?: Transport; previous?: { product: ExtractedProduct; observedAt: string };
}): Promise<Acquisition> {
  const attempts: Attempt[] = [];
  let sawOpen = false;
  const finish = (status: Acquisition["status"], product: ExtractedProduct | null = null, observedAt: string | null = null): Acquisition => ({
    status, product: product ?? options.previous?.product ?? null, previousRetained: !product && !!options.previous,
    observedAt: observedAt ?? options.previous?.observedAt ?? null, attempts,
    browserRequested: attempts.some((a) => a.transport === "browser"), costUsd: null,
  });
  for (const [kind, transport] of [["http", options.http], ["browser", options.browser]] as const) {
    if (!transport) continue;
    const started = Date.now();
    let doc: Document;
    try { doc = await transport.fetch(url); }
    catch { attempts.push({ transport: kind, ms: Date.now() - started, error: "Fetch failed" }); continue; }
    const observation = observeDocument(doc);
    const attempt: Attempt = { transport: kind, ms: Date.now() - started, observation };
    attempts.push(attempt);
    if (observation.state === "locked" || observation.state === "maintenance") return finish("store_closed");
    if (observation.state !== "open") continue;
    sawOpen = true;
    const extraction = extractRecipe(doc.html, doc.url, recipe);
    attempt.extraction = extraction;
    if (!extraction.product) continue;
    const prior = options.previous?.product;
    if (prior && (prior.currency !== extraction.product.currency || prior.title !== extraction.product.title ||
      (prior.priceCents > 0 && (extraction.product.priceCents / prior.priceCents < 0.25 || extraction.product.priceCents / prior.priceCents > 4)))) {
      extraction.issues.push("change: identity, currency or price needs review");
      return finish("suspicious_change");
    }
    return finish("ok", extraction.product, doc.observedAt);
  }
  return finish(sawOpen ? "repair_needed" : "access_failed");
}
