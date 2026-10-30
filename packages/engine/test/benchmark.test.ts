import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { corpusSchema, matches, regressions, score, type Report } from "../benchmark/score.js";

const manifest = fileURLToPath(new URL("../benchmark/corpus.json", import.meta.url));
describe("frozen real-page benchmark", () => {
  it("retains every previously correct field, with at least ten non-Shopify product sites", async () => {
    const baseline = JSON.parse(await readFile(new URL("../benchmark/baseline.json", import.meta.url), "utf8")) as Report;
    const result = await score(manifest);
    expect(result.nonShopifyProductSites).toBeGreaterThanOrEqual(10);
    expect(regressions(baseline, result)).toEqual([]);
    expect(result.groups["recipe/holdout"]!.total).toBeGreaterThan(0);
  }, 15000);

  it("distinguishes unknown from out of stock and zero price, with no price tolerance", () => {
    expect(matches(undefined, null)).toBe(true);
    expect(matches(false, null)).toBe(false);
    expect(matches(0, null)).toBe(false);
    expect(matches(10950000, 1095)).toBe(false);
    expect(matches("Mac\u00a0mini", "Mac mini")).toBe(true);
    expect(matches(["a"], ["a", "b"])).toBe(false);
  });

  it("detects a lost correct field even if another field improves", async () => {
    const baseline = JSON.parse(await readFile(new URL("../benchmark/baseline.json", import.meta.url), "utf8")) as Report;
    const current = structuredClone(baseline);
    current.checks.find((c) => c.correct)!.correct = false;
    current.checks.find((c) => !c.correct && c.actual === null)!.correct = true;
    expect(regressions(baseline, current)).toHaveLength(1);
    current.checks.pop();
    expect(() => regressions(baseline, current)).toThrow("coverage changed");
    current.corpusSha256 = "changed";
    expect(() => regressions(baseline, current)).toThrow("Corpus changed");
  });

  it("refuses duplicate snapshots, site leakage and unlabelled products", async () => {
    const corpus = JSON.parse(await readFile(manifest, "utf8"));
    const duplicate = structuredClone(corpus);
    duplicate.cases.push(duplicate.cases[0]);
    expect(corpusSchema.safeParse(duplicate).success).toBe(false);
    const leaked = structuredClone(corpus);
    leaked.cases[1].split = "holdout";
    expect(corpusSchema.safeParse(leaked).success).toBe(false);
    const empty = structuredClone(corpus);
    empty.cases[0].labels = {};
    expect(corpusSchema.safeParse(empty).success).toBe(false);
  });

  it("refuses changed snapshots before scoring them", async () => {
    const directory = await mkdtemp(join(tmpdir(), "skeleton-benchmark-"));
    try {
      const corpus = JSON.parse(await readFile(manifest, "utf8"));
      corpus.cases = [corpus.cases[0]];
      corpus.cases[0].file = "page.html.gz";
      await writeFile(join(directory, "page.html.gz"), gzipSync("changed"));
      await writeFile(join(directory, "corpus.json"), JSON.stringify(corpus));
      await expect(score(join(directory, "corpus.json"))).rejects.toThrow("hash mismatch");
      const original = JSON.parse(await readFile(manifest, "utf8"));
      await writeFile(join(directory, "page.html.gz"), await readFile(new URL(`../benchmark/${original.cases[0].file}`, import.meta.url)));
      const compact = await score(join(directory, "corpus.json"));
      await writeFile(join(directory, "corpus.json"), JSON.stringify(corpus, null, 2).replace(/\n/g, "\r\n"));
      const windows = await score(join(directory, "corpus.json"));
      expect(windows.corpusSha256).toBe(compact.corpusSha256);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
