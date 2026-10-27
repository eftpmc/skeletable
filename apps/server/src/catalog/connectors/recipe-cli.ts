import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { recipeSchema } from "./recipes.js";
import { fixtureSchema, suggestRepairs } from "./repair.js";
import { RecipeStore } from "./recipe-store.js";
import { acquireProduct, httpTransport } from "./acquisition.js";
import { browserlessTransport } from "./browserless.js";
import { runRepairDemo } from "./repair-demo.js";

const [command, ...args] = process.argv.slice(2);
const readJson = async (file: string) => JSON.parse(await readFile(file, "utf8"));
async function output(value: unknown, file?: string) {
  const json = JSON.stringify(value, null, 2);
  if (file) { await mkdir(dirname(file), { recursive: true }); await writeFile(file, json); }
  else console.log(json);
}

try {
  if (command === "demo") await output(await runRepairDemo(), args[0]);
  else if (command === "read" && args[0] && args[1]) {
    const recipe = recipeSchema.parse(await readJson(args[0]));
    const browser = args.includes("--browser") ? browserlessTransport({
      endpoint: process.env.BROWSERLESS_URL ?? "https://production-sfo.browserless.io/function",
      token: process.env.BROWSERLESS_TOKEN ?? "", origins: [recipe.origin],
      resourceOrigins: (process.env.BROWSER_RESOURCE_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    }) : undefined;
    const result = await acquireProduct(args[1], recipe, { http: httpTransport({ timeoutMs: 8000 }), browser });
    await output(result);
    if (result.status !== "ok") process.exitCode = 2;
  } else if (command === "suggest" && args[0] && args[1]) {
    const recipe = recipeSchema.parse(await readJson(args[0]));
    const doc = fixtureSchema.shape.document.parse(await readJson(args[1]));
    await output(suggestRepairs(recipe, doc), args[2]);
  } else if (["init", "propose", "approve", "rollback", "status"].includes(command ?? "") && args[0]) {
    const store = new RecipeStore(args[0]);
    if (command === "status") await output(await store.read());
    else if (command === "rollback" && args[1] && args[2]) await output(await store.rollback(Number(args[1]), args[2]));
    else if (args[1] && args[2]) {
      const fixtures = z.array(fixtureSchema).parse(await readJson(args[2]));
      if (command === "init" && args[3]) await output(await store.initialize(recipeSchema.parse(await readJson(args[1])), fixtures, args[3]));
      else if (command === "propose") await output(await store.propose(recipeSchema.parse(await readJson(args[1])), fixtures));
      else if (command === "approve" && args[3]) await output(await store.approve(args[1], fixtures, args[3]));
      else throw new Error("Reviewer argument required");
    } else throw new Error("Missing command arguments");
  } else throw new Error("Usage: recipes demo [report.json] | read recipe.json URL [--browser] | suggest recipe.json document.json [output.json] | init registry.json recipe.json fixtures.json reviewer | propose registry.json candidate.json fixtures.json | approve registry.json proposal-id fixtures.json reviewer | rollback registry.json version reviewer | status registry.json");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Recipe command failed");
  process.exitCode = 1;
}
