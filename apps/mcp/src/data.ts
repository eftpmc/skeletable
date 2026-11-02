import { cellStatus, csvField, displayValue, emptyLabel, quoteLink, rowSlugs, statusLabels, tableCsv } from "@skeleton/tables/share";
import type { Context, Hono } from "hono";
import { html } from "hono/html";
import { everyone, readable } from "./access.js";
import { hasValue, isFound, isGiven } from "@skeleton/tables/format";
import { lastRead, type PublishedTable } from "./library.js";
import type { Sql } from "./db.js";
import { tableForKey } from "./links.js";
import { loadVersion, versionNumber } from "./versions.js";

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
export function dataRoutes(app: Hono, tables: PublishedTable[], publicUrl: string, sql?: Sql) {
  /** A table as a file. `?columns=a,b` picks columns by id and `?names=0` leaves out row names, for loading into a notebook as it is. */
  const sendFile = (c: Context, table: PublishedTable, format: string, cache: string, proofByDefault = false) => {
    c.header("access-control-allow-origin", "*");
    c.header("cache-control", cache);
    if (!table.private) c.header("link", '<https://creativecommons.org/licenses/by/4.0/>; rel="license"');
    if (format === "json") return c.json(tableFile(table, publicUrl));
    const columns = c.req.query("columns")?.split(",").map((id) => id.trim()).filter(Boolean);
    c.header("content-type", "text/csv; charset=utf-8");
    const proof = c.req.query("proof");
    return c.body(tableCsv(table, proof === undefined ? proofByDefault : proof === "1", { columns, names: c.req.query("names") !== "0" }));
  };
  const fileName = (file: string) => /^(.+)\.(csv|json)$/.exec(file) ?? undefined;

  // A private table's data link, which works without signing in. It's never cached along the way.
  if (sql) {
    // A link that no longer works says so plainly, rather than opening the site.
    const gone = (c: Context) => c.text("This data link doesn't work any more. Ask the table's owner for a new one.", 404);
    app.get("/d/:file", async (c) => {
      const [, key, format] = fileName(c.req.param("file")) ?? [];
      const table = key ? await tableForKey(sql, tables, key) : undefined;
      return table ? sendFile(c, table, format!, "private, no-store") : gone(c);
    });
    app.get("/d/:key/:file", async (c) => {
      const [, name, format] = fileName(c.req.param("file")) ?? [];
      const table = await tableForKey(sql, tables, c.req.param("key"));
      const number = name ? versionNumber(name) : undefined;
      const version = table && number ? await loadVersion(sql, table, number) : undefined;
      return version ? sendFile(c, version, format!, "private, no-store") : gone(c);
    });
    // A public table's saved version, like /data/owner/slug/v2.csv. It never changes, so it can be kept.
    app.get("/data/:owner/:slug/:file", async (c, next) => {
      const [, name, format] = fileName(c.req.param("file")) ?? [];
      const table = readable(tables, everyone).find((t) => t.owner === c.req.param("owner") && t.slug === c.req.param("slug"));
      const number = name ? versionNumber(name) : undefined;
      const version = table && number ? await loadVersion(sql, table, number) : undefined;
      return version ? sendFile(c, version, format!, "public, max-age=86400") : next();
    });
  }

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
    const given = isGiven(cell) ? cell : undefined;
    if (format === "json") {
      const { quote, source, kind, conflicts } = stated ?? {};
      const value = hasValue(cell) ? cell.value : null;
      return c.json({ table: table.title, row: row.key, column: column.label, unit: column.unit, value, status, quote, source: source ?? given?.source, kind, origin: given?.origin, note: given?.note, read: cell.read, conflicts, url, licence: "CC BY 4.0", attribution: `Skeletable, ${table.title}, ${url}` });
    }
    c.header("content-type", "text/csv; charset=utf-8");
    return c.body(csvField(hasValue(cell) ? cell.value : undefined));
  });

  // A card for other pages. It reads the live cell, so a change or a lost quote shows up wherever it's embedded.
  app.get("/embed/:owner/:slug/:row/:column", (c, next) => {
    const found = cellAt(c, c.req.param("column"));
    if (!found) return next();
    const { row, column, cell, status, url } = found;
    c.header("cache-control", "public, max-age=3600");
    const stated = isFound(cell) ? cell : undefined;
    const value = hasValue(cell) ? `${displayValue(cell.value)}${column.unit ? ` ${column.unit}` : ""}` : emptyLabel(cell);
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
    // The full CSV has always come with its proof, so it still does unless asked otherwise.
    return sendFile(c, table, file.endsWith(".json") ? "json" : "csv", "public, max-age=3600", true);
  });
}
