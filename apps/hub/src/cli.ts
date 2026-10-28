// The hub from the command line: HUB_DATABASE_URL=… tsx src/cli.ts <command>
import { createHubDb, runHubMigrations, schema } from "@skeleton/hub-db";
import { and, asc, count, eq, isNull, lte, or } from "drizzle-orm";
import { crawlSource } from "./engine/crawl.js";
import { annotateByRules } from "./annotate/rules.js";
import { buildCatalog } from "./build.js";
import { importLabBrands } from "./lab/brands.js";
import { importLab } from "./lab/import.js";
import { resolveListings, resolveSources } from "./resolve.js";
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
  status                                counts`;

const [command, ...args] = process.argv.slice(2);
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
