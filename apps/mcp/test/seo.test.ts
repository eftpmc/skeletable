import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../src/app.js";
import { loadTables } from "../src/library.js";
import { visitNames } from "../src/visits.js";

const tables = await loadTables(fileURLToPath(new URL("../../../tables", import.meta.url)));

describe("what crawlers and tools can read", () => {
  let dir: string;
  let site: ReturnType<typeof createApp>;
  const text = async (path: string) => (await site.request(path)).text();

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "web-"));
    await writeFile(join(dir, "index.html"), '<title>site</title><div id="root"></div>');
    site = createApp(tables, dir);
  });

  afterAll(() => rm(dir, { recursive: true }));

  it("puts a table's values in its page, without needing scripts", async () => {
    const page = await text("/skeletable/data-breach-laws");
    expect(page).toContain("<td>60 days</td>");
    expect(page).toContain("Not found");
    expect(page).toContain("None stated");
    expect(page).toContain('href="/skeletable/data-breach-laws/row/texas"');
    expect(page).toContain('href="/data/skeletable/data-breach-laws.csv"');
  });

  it("describes a table as a dataset, with its licence, date and files", async () => {
    const page = await text("/skeletable/data-breach-laws");
    const [, json] = page.match(/application\/ld\+json">(.*?)<\/script>/s)!;
    const data = JSON.parse(json!);
    expect(data).toMatchObject({
      "@type": "Dataset",
      license: "https://creativecommons.org/licenses/by/4.0/",
      isAccessibleForFree: true,
      identifier: { propertyID: "Skeletable", value: "skeletable/data-breach-laws" },
      publisher: { name: "Skeletable" },
      includedInDataCatalog: { name: "Skeletable public tables" },
    });
    expect(data.dateModified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(data.distribution).toHaveLength(2);
  });

  it("identifies Skeletable as the organization publishing the site", async () => {
    const page = await text("/");
    const [, json] = page.match(/application\/ld\+json">(.*?)<\/script>/s)!;
    expect(JSON.parse(json!)).toMatchObject({
      "@type": "Organization",
      "@id": "https://skeletable.com/#organization",
      name: "Skeletable",
      url: "https://skeletable.com",
      logo: "https://skeletable.com/logo.png",
    });
  });

  it("gives each row a page with the proof for its values", async () => {
    const page = await text("/skeletable/data-breach-laws/row/texas");
    expect(page).toContain("<title>Texas: US data breach notification laws · Skeletable</title>");
    expect(page).toContain("<blockquote>");
    expect(page).toContain("Source: <a href=");
    expect(page).toContain('rel="canonical" href="https://skeletable.com/skeletable/data-breach-laws/row/texas"');
  });

  it("escapes a table's text everywhere it's written into a page", async () => {
    const hostile = structuredClone(tables[0]!);
    hostile.slug = "hostile";
    hostile.rows[0]!.key = '<img src=x onerror="bad()">';
    const app = createApp([hostile], dir);
    const pages = await Promise.all(["/skeletable/hostile", "/skeletable/hostile/row/img-src-x-onerror-bad"].map(async (path) => (await app.request(path)).text()));
    for (const page of pages) expect(page).not.toContain("<img src=x");
  });

  it("answers an unknown row like any unknown page", async () => {
    expect(await text("/skeletable/data-breach-laws/row/nowhere")).not.toContain("<blockquote>");
  });

  it("sends a renamed row's old address to the new one", async () => {
    const app = createApp([{ ...tables[0]!, moved: { "old-name": tables[0]!.rows[0]!.key } }], dir);
    const response = await app.request(`/${tables[0]!.owner}/${tables[0]!.slug}/row/old-name`);
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toContain("/row/");
  });

  it("serves each table as CSV and JSON, credited and open to any site", async () => {
    const json = await site.request("/data/skeletable/data-breach-laws.json");
    expect(json.headers.get("access-control-allow-origin")).toBe("*");
    expect(json.headers.get("link")).toContain("licenses/by/4.0");
    expect(await json.json()).toMatchObject({ licence: "CC BY 4.0", title: "US data breach notification laws", rows: expect.arrayContaining([expect.objectContaining({ key: "Texas", url: "https://skeletable.com/skeletable/data-breach-laws/row/texas" })]) });
    const csv = await site.request("/data/skeletable/data-breach-laws.csv");
    expect(csv.headers.get("content-type")).toContain("text/csv");
    expect(await csv.text()).toContain("Texas,");
  });

  it("lists rows and their dates in the sitemap, and tables in llms.txt", async () => {
    const sitemap = await text("/sitemap.xml");
    expect(sitemap).toContain("/skeletable/data-breach-laws/row/texas</loc><lastmod>");
    expect(await text("/llms.txt")).toContain("data/skeletable/data-breach-laws.json");
  });

  it("leaves data and row pages open to crawlers", async () => {
    const robots = await text("/robots.txt");
    expect(robots).not.toContain("/data");
    expect(robots).not.toContain("/row");
  });
});

describe("counting visits by kind", () => {
  it("counts crawlers apart from people, wherever they go", () => {
    expect(visitNames("/skeletable/e-readers", "Mozilla/5.0 (compatible; GPTBot/1.2)")).toEqual(["bot:gptbot"]);
    expect(visitNames("/api/tables", "Mozilla/5.0 (compatible; ClaudeBot/1.0)")).toEqual(["bot:claudebot"]);
    expect(visitNames("/mcp", "ChatGPT-User/1.0")).toEqual(["bot:chatgpt-user"]);
  });

  it("counts people arriving from AI tools", () => {
    expect(visitNames("/skeletable/e-readers", "Mozilla/5.0", "https://chatgpt.com/")).toEqual(["page", "from:chatgpt"]);
    expect(visitNames("/x", "Mozilla/5.0", "https://www.perplexity.ai/search")).toEqual(["page", "from:perplexity"]);
  });

  it("isn't fooled by a look-alike address, and copes with a broken one", () => {
    expect(visitNames("/x", "Mozilla/5.0", "https://chatgpt.com.evil.example/")).toEqual(["page"]);
    expect(visitNames("/x", "Mozilla/5.0", "not a url")).toEqual(["page"]);
  });

  it("keeps the counts it had, and skips files and the API", () => {
    expect(visitNames("/mcp", "Mozilla/5.0")).toEqual(["mcp"]);
    expect(visitNames("/assets/index.js", "GPTBot")).toEqual([]);
    expect(visitNames("/api/tables", "Mozilla/5.0")).toEqual([]);
  });
});
