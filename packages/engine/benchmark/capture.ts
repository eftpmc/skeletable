import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { resolve } from "node:path";
import { politeContext } from "../src/index.js";

// Explicit URL list: no credentials, browser escalation, or unbounded crawling.
const input = process.argv[2];
const output = process.argv[3];
if (!input || !output) throw new Error("Usage: tsx benchmark/capture.ts targets.json output-directory");
const targets = JSON.parse(await readFile(input, "utf8")) as { id: string; url: string }[];
const directory = resolve(output);
await mkdir(directory, { recursive: true });
// Never overwrite an earlier capture's provenance. Refresh into a new directory.
await writeFile(resolve(directory, "captures.json"), "[]\n", { flag: "wx" });
const records: Record<string, unknown>[] = [];
// Sequential, including across targets on the same host. Robots and pacing use the engine.
const contexts = new Map<string, Awaited<ReturnType<typeof politeContext>>>();
for (const target of targets) {
  if (!/^[a-z0-9-]+$/.test(target.id)) throw new Error("Invalid capture id");
  const capturedAt = new Date().toISOString();
  try {
    const origin = new URL(target.url).origin;
    let context = contexts.get(origin);
    if (!context) {
      context = await politeContext(new URL(origin), { backoffMs: [], fetch: { timeoutMs: 12000 } });
      contexts.set(origin, context);
    }
    const response = await context.fetch(target.url, "text/html");
    if (!response.contentType.includes("text/html")) throw new Error(`Not HTML: ${response.contentType}`);
    const file = `${target.id}.html.gz`;
    await writeFile(resolve(directory, file), gzipSync(response.body), { flag: "wx" });
    records.push({ ...target, capturedAt, finalUrl: response.url, status: response.status,
      file, bytes: response.body.length, sha256: createHash("sha256").update(response.body).digest("hex") });
    console.log(`${target.id}: captured ${response.body.length} bytes (requires review)`);
  } catch (error) {
    records.push({ ...target, capturedAt, error: String(error) });
    console.log(`${target.id}: ${error}`);
  }
  await writeFile(resolve(directory, "captures.json"), JSON.stringify(records, null, 2) + "\n");
}
