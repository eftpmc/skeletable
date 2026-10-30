import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { politeContext, readProductPage, reviewedRecipeFor, standardReader } from "../src/index.js";
import { corpusSchema } from "./score.js";

const output = resolve(process.argv[2] ?? "benchmark/live-run");
await mkdir(output, { recursive: false });
const corpus = corpusSchema.parse(JSON.parse(await readFile(new URL("./corpus.json", import.meta.url), "utf8")));
const ids = ["adafruit-second", "ikea", "palace", "thomann", "patagonia"];
const records: Record<string, unknown>[] = [];
const options = { backoffMs: [], fetch: { timeoutMs: 8000 } };
for (const id of ids) {
  const item = corpus.cases.find((c) => c.id === id)!;
  const origin = new URL(new URL(item.url).origin);
  const context = await politeContext(origin, options);
  let requests = 0;
  const errors: string[] = [];
  const started = Date.now();
  const discovered = await standardReader.sample!(origin, null, { fetch: async (url, accept) => {
    if (requests >= 8) throw new Error("Discovery budget exhausted");
    requests++;
    try { return await context.fetch(url, accept); }
    catch (error) { errors.push(String(error)); throw error; }
  } }, 2);
  records.push({ id, stage: "discovery", at: new Date(started).toISOString(), elapsedMs: Date.now() - started,
    requests, budget: 8, budgetReached: requests >= 8, errors, result: discovered });
  console.log(`${id}: discovered ${discovered.pagesFound} candidates within ${requests} requests`);
  for (let round = 1; round <= 3; round++) {
    const at = Date.now();
    try {
      const response = await context.fetch(item.url, "text/html");
      const html = response.body.toString("utf8");
      const result = readProductPage(html, response.url, item.recipe ?? reviewedRecipeFor(response.url));
      records.push({ id, stage: "refresh", round, at: new Date(at).toISOString(), elapsedMs: Date.now() - at,
        status: response.status, finalUrl: response.url,
        bodySha256: createHash("sha256").update(response.body).digest("hex"),
        readingSha256: createHash("sha256").update(JSON.stringify(result.reading)).digest("hex"), ...result });
      console.log(`${id}: refresh ${round}: ${result.reading ? "reading" : "no complete reading"}`);
    } catch (error) {
      records.push({ id, stage: "refresh", round, at: new Date(at).toISOString(), elapsedMs: Date.now() - at, error: String(error) });
      console.log(`${id}: refresh ${round}: ${error}`);
    }
    await writeFile(resolve(output, "observations.json"), JSON.stringify({ rounds: 3, discoveryRequestBudget: 8,
      caveat: "Short-session repeated observations, not a freshness SLA or independently verified live accuracy", records }, null, 2) + "\n");
  }
}
