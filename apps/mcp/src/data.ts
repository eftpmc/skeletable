import { cellStatus, csvField, displayValue, emptyLabel, quoteLink, rowSlugs, statusLabels, tableCsv } from "@skeleton/tables/share";
import type { Context, Hono } from "hono";
import { html } from "hono/html";
import { everyone, readable } from "./access.js";
import { isFound } from "@skeleton/tables/format";
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
  /** The public cell an address names. A renamed row keeps its old address. */
  const cellAt = (c: Context, columnId: string) => {
    const table = readable(tables, everyone).find((t) => t.owner === c.req.param("owner") && t.slug === c.req.param("slug"));
    if (!table) return undefined;
    const slugs = rowSlugs(table);
    const slug = c.req.param("row")!;
    const key = table.moved?.[slug] ?? table.rows.find((candidate) => slugs.get(candidate.key) === slug)?.key;
    const row = table.rows.find((candidate) => candidate.key === key);
    const column = table.columns.find((candidate) => candidate.id === columnId);
    const cell = column && row?.cells[column.id];
    return row && column && cell ? { table, row, column, cell, status: cellStatus(cell, row.key, column.id, table.watch), url: `${publicUrl}/${table.owner}/${table.slug}/row/${slugs.get(row.key)!}#${column.id}` } : undefined;
  };

  // One value, for a formula in someone's own spreadsheet, or with its proof for their code.
  app.get("/data/:owner/:slug/:row/:file", (c, next) => {
    const [, columnId, format] = c.req.param("file").match(/^(.+)\.(csv|json)$/) ?? [];
    const found = columnId ? cellAt(c, columnId) : undefined;
    if (!found) return next();
    const { table, row, column, cell, status, url } = found;
    c.header("access-control-allow-origin", "*");
    c.header("cache-control", "public, max-age=3600");
    const stated = isFound(cell) ? cell : undefined;
    if (format === "json") {
      const { value = null, quote, source, read, kind, conflicts } = stated ?? {};
      return c.json({ table: table.title, row: row.key, column: column.label, unit: column.unit, value, status, quote, source, kind, read: read ?? cell.read, conflicts, url, licence: "CC BY 4.0", attribution: `Skeletable, ${table.title}, ${url}` });
    }
    c.header("content-type", "text/csv; charset=utf-8");
    return c.body(csvField(stated?.value));
  });

  // A card for other pages. It reads the live cell, so a change or a lost quote shows up wherever it's embedded.
  app.get("/embed/:owner/:slug/:row/:column", (c, next) => {
    const found = cellAt(c, c.req.param("column"));
    if (!found) return next();
    const { row, column, cell, status, url } = found;
    c.header("cache-control", "public, max-age=3600");
    const stated = isFound(cell) ? cell : undefined;
    const value = stated ? `${displayValue(stated.value)}${column.unit ? ` ${column.unit}` : ""}` : emptyLabel(cell);
    return c.html(html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${row.key}, ${column.label} · Skeletable</title>
<style>
:root { color-scheme: light dark; --line: light-dark(#e4e4e7, #27272a); --quiet: light-dark(#52525b, #a1a1aa); }
* { box-sizing: border-box; }
body { margin: 0; background: Canvas; color: CanvasText; font: 14px/1.45 system-ui, sans-serif; }
main { border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; }
p { margin: 0; }
.what { color: var(--quiet); font-size: 12px; }
.value { font-size: 18px; font-weight: 600; }
.quote { margin-top: 2px; color: var(--quiet); overflow-wrap: anywhere; }
.foot { display: flex; flex-wrap: wrap; gap: 4px 10px; margin-top: 6px; color: var(--quiet); font-size: 12px; }
a { color: inherit; }
.warn { color: light-dark(#b91c1c, #f87171); font-weight: 500; }
</style>
</head>
<body>
<main>
<p class="what">${row.key} · ${column.label}</p>
<p class="value">${value}</p>
${stated ? html`<p class="quote">“${stated.quote}”</p>` : ""}
<p class="foot">
${stated ? html`<a href="${quoteLink(stated.source, stated.quote)}" target="_blank" rel="noopener noreferrer">${new URL(stated.source).hostname.replace(/^www\./, "")}</a><span>Read ${stated.read}</span>` : ""}
<span class="${status === "gone" || status === "fracture" ? "warn" : ""}">${statusLabels[status]}</span>
<a href="${url}" target="_blank" rel="noopener">Skeletable</a>
</p>
</main>
</body>
</html>`);
  });

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
