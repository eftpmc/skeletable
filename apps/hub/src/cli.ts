// The hub from the command line: HUB_DATABASE_URL=… tsx src/cli.ts <command>
import { createHubDb, runHubMigrations, schema } from "@skeleton/hub-db";
import { and, asc, count, eq, isNull, lte, or } from "drizzle-orm";
import { crawlSource } from "./engine/crawl.js";
import { writeFile, readFile } from "node:fs/promises";
import { annotateByRules } from "./annotate/rules.js";
import { benchmarkItems, drawBenchmark, saveDrafts, scoreModel } from "./benchmark.js";
import { buildCatalog } from "./build.js";
import { importLabBrands } from "./lab/brands.js";
import { importLab } from "./lab/import.js";
import { resolveListings, resolveSources } from "./resolve.js";
import { serve } from "@hono/node-server";
import { hubApi, issueToken } from "./api.js";
import { queueExtractFacts } from "./jobs.js";
import { runWorker } from "./worker.js";
import { addSource, domainOf } from "./sources.js";

const usage = `Usage: hub <command>
  migrate                               apply the hub's migrations
  add <url>                             add a site and detect its reader
  crawl <domain>                        crawl one site now
  crawl --due [count]                   crawl approved sites that are due (default 10)
  import-lab <products dir> [vectors]   import the brand lab's store files and photo vectors
  import-lab-brands <old pack.jsonl.gz> carry over the lab's names, places, descriptions and quality
  annotate                              annotate listings with the hub's rules, then resolve final values
  build <file.jsonl.gz>                 write the catalog file from the final values
  token <handle> <person|worker|agent>  issue a contributor a token for the API (shown once)
  queue [count]                         queue extract-facts jobs for listings with no category (default 1000)
  serve [port]                          run the contributor API (default 4100)
  work <hub url> [model] [count]        answer jobs with a local Ollama model (HUB_TOKEN, OLLAMA_URL)
  benchmark draw <name> [random] [unplaced]   set aside listings to check (default 200 and 100)
  benchmark export <name> <file>        write a set's listings as JSON, for drafting
  benchmark drafts <name> <file>        load draft answers ([{ listingId, draft }]) into a set
  benchmark score <name> [model]        score a local model against the checked answers
  status                                counts`;

const [command, ...args] = process.argv.slice(2);

// A worker only talks to a hub over its API; it needs no database.
if (command === "work" && args[0]) {
  const token = process.env.HUB_TOKEN;
  if (!token) throw new Error("set HUB_TOKEN to the token the hub issued you");
  console.log(
    await runWorker({
      hub: args[0],
      token,
      ollama: process.env.OLLAMA_URL ?? "http://localhost:11434",
      model: args[1] ?? "qwen3:4b",
      limit: args[2] ? Number(args[2]) : undefined,
      log: (line) => console.log(line),
    }),
  );
  process.exit(0);
}

const url = process.env.HUB_DATABASE_URL;
if (!command || !url) {
  console.error(usage);
  process.exit(1);
}

await runHubMigrations(url);
const { db, close } = createHubDb(url);
const { listing, reading, source, embedding } = schema;
try {
  if (command === "migrate") {
    console.log("migrations applied");
  } else if (command === "add" && args[0]) {
    console.log(await addSource(db, args[0]));
  } else if (command === "crawl" && args[0] === "--due") {
    const due = await db
      .select({ id: source.id, domain: source.domain })
      .from(source)
      .where(and(eq(source.status, "approved"), or(isNull(source.nextCrawlAt), lte(source.nextCrawlAt, new Date()))))
      .orderBy(asc(source.nextCrawlAt))
      .limit(Number(args[1] ?? 10));
    for (const site of due) console.log(site.domain, await crawlSource(db, site.id));
  } else if (command === "crawl" && args[0]) {
    const [site] = await db.select({ id: source.id }).from(source).where(eq(source.domain, domainOf(args[0])));
    if (!site) throw new Error(`${args[0]} isn't a source yet; add it first`);
    console.log(await crawlSource(db, site.id));
  } else if (command === "import-lab" && args[0]) {
    console.log(await importLab(db, args[0], args[1], (line) => console.log(line)));
  } else if (command === "import-lab-brands" && args[0]) {
    console.log(await importLabBrands(db, args[0]));
    console.log("final values updated:", await resolveSources(db));
  } else if (command === "annotate") {
    console.log("annotations added:", await annotateByRules(db, (line) => console.log(line)));
    console.log("final values updated:", await resolveListings(db), "listing,", await resolveSources(db), "source");
  } else if (command === "build" && args[0]) {
    console.log(await buildCatalog(db, args[0], (line) => console.log(line)));
  } else if (command === "token" && args[0] && ["person", "worker", "agent"].includes(args[1] ?? "")) {
    console.log(await issueToken(db, args[0], args[1] as "person" | "worker" | "agent"));
  } else if (command === "queue") {
    console.log("jobs queued:", await queueExtractFacts(db, Number(args[0] ?? 1000)));
  } else if (command === "serve") {
    const port = Number(args[0] ?? 4100);
    serve({ fetch: hubApi(db).fetch, port });
    console.log(`hub API on http://localhost:${port}`);
    await new Promise(() => {});
  } else if (command === "benchmark" && args[0] === "draw" && args[1]) {
    console.log("listings set aside:", await drawBenchmark(db, args[1], { random: Number(args[2] ?? 200), unplaced: Number(args[3] ?? 100) }));
  } else if (command === "benchmark" && args[0] === "export" && args[1] && args[2]) {
    const items = await benchmarkItems(db, args[1]);
    await writeFile(args[2], JSON.stringify(items.map((i) => ({ listingId: i.listingId, ...i.input })), null, 1));
    console.log(`${items.length} listings written to ${args[2]}`);
  } else if (command === "benchmark" && args[0] === "drafts" && args[1] && args[2]) {
    console.log(await saveDrafts(db, args[1], JSON.parse(await readFile(args[2], "utf8"))));
  } else if (command === "benchmark" && args[0] === "score" && args[1]) {
    const score = await scoreModel(db, args[1], { ollama: process.env.OLLAMA_URL ?? "http://localhost:11434", model: args[2] ?? "qwen3:4b" });
    console.log({ ...score, misses: score.misses.slice(0, 40) });
  } else if (command === "status") {
    const total = async (table: typeof source | typeof listing | typeof reading | typeof embedding) =>
      (await db.select({ n: count() }).from(table))[0]!.n;
    console.log({ sources: await total(source), listings: await total(listing), readings: await total(reading), embeddings: await total(embedding) });
  } else {
    console.error(usage);
    process.exitCode = 1;
  }
} finally {
  await close();
}
