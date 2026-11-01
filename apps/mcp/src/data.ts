import { rowSlugs, tableCsv } from "@skeleton/tables/share";
import type { Hono } from "hono";
import { everyone, readable } from "./access.js";
import { lastRead, type PublishedTable } from "./library.js";

/** A public table as a data file, with what a reuser needs to credit it. */
export function tableFile(table: PublishedTable, publicUrl: string) {
  const base = `${publicUrl}/${table.owner}/${table.slug}`;
  const slugs = rowSlugs(table);
  const { title, question, scope, topic, columns } = table;
  return {
    title,
    question,
    scope,
    topic,
    url: base,
    licence: "CC BY 4.0",
    attribution: `Skeletable, ${title}, ${base}`,
    lastRead: lastRead(table),
    columns,
    rows: table.rows.map((row) => ({ key: row.key, url: `${base}/row/${slugs.get(row.key)!}`, cells: row.cells })),
  };
}

/**
 * Plain addresses for a public table's data, safe to crawl and link to. These never change shape
 * without a new address, because tools will come to rely on them. A private table isn't here at all.
 */
export function dataRoutes(app: Hono, tables: PublishedTable[], publicUrl: string) {
  app.get("/data/:owner/:file", (c, next) => {
    const file = c.req.param("file");
    const table = readable(tables, everyone).find((t) => t.owner === c.req.param("owner") && (file === `${t.slug}.csv` || file === `${t.slug}.json`));
    if (!table) return next();
    c.header("access-control-allow-origin", "*");
    c.header("cache-control", "public, max-age=3600");
    c.header("link", '<https://creativecommons.org/licenses/by/4.0/>; rel="license"');
    if (file.endsWith(".json")) return c.json(tableFile(table, publicUrl));
    c.header("content-type", "text/csv; charset=utf-8");
    return c.body(tableCsv(table, true));
  });
}
