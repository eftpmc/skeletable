import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isFound, type Cell, type Column } from "@skeleton/tables/format";
import { displayValue, emptyLabel, inlineParts, rowSlugs } from "@skeleton/tables/share";
import type { Hono } from "hono";
import { everyone, readable } from "./access.js";
import { lastRead, type PublishedTable } from "./library.js";
import { postBlocks, published, type Post } from "./posts.js";
import { previewImage } from "./preview.js";

const description = "A public library of tables, where each cell links to the exact words that prove it.";

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Row = PublishedTable["rows"][number];

/** The tags search engines and link previews read, since the page itself is built in the browser. */
function headFor(title: string, summary: string, url: string, data?: object, image?: string) {
  const tags = [
    `<title>${escape(title)}</title>`,
    `<meta name="description" content="${escape(summary)}" />`,
    `<link rel="canonical" href="${escape(url)}" />`,
    `<meta property="og:title" content="${escape(title)}" />`,
    `<meta property="og:description" content="${escape(summary)}" />`,
    `<meta property="og:url" content="${escape(url)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:image" content="${escape(new URL(image ?? "/logo.png", url).href)}" />`,
    `<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}" />`,
  ];
  // Written out of a script's way, so a table's text can't close the tag.
  if (data) tags.push(`<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`);
  return tags.join("\n    ");
}

const shown = (cell: Cell | undefined, column: Column) => (cell && isFound(cell) ? `${displayValue(cell.value)}${column.unit ? ` ${column.unit}` : ""}` : emptyLabel(cell));

/** The table as plain HTML, values included, because many crawlers don't run scripts. The app replaces it when it loads. */
function tableText(table: PublishedTable) {
  const base = `/${table.owner}/${table.slug}`;
  const slugs = rowSlugs(table);
  const header = table.columns.map((column) => `<th>${escape(column.label)}${column.unit ? ` (${escape(column.unit)})` : ""}</th>`).join("");
  const rows = table.rows.map((row) => {
    const cells = table.columns.map((column) => `<td>${escape(shown(row.cells[column.id], column))}</td>`).join("");
    return `<tr><th><a href="${base}/row/${escape(slugs.get(row.key)!)}">${escape(row.key)}</a></th>${cells}</tr>`;
  }).join("");
  return `<main><h1>${escape(table.title)}</h1><p>${escape(table.question)}</p><p>${escape(table.scope)}</p><p>Last read ${escape(lastRead(table))}. "Not found" means no source we could use said so, which never means no. "None stated" means the source was read and gives no such value. Each row's page gives the source and exact quote for its values.</p><table><thead><tr><th>Name</th>${header}</tr></thead><tbody>${rows}</tbody></table><p>Data: <a href="/data/${table.owner}/${table.slug}.csv">CSV</a>, <a href="/data/${table.owner}/${table.slug}.json">JSON</a>. Licence: CC BY 4.0.</p></main>`;
}

/** One row with the proof for each value, the most useful page to land on from a search. */
function rowText(table: PublishedTable, row: Row) {
  const base = `/${table.owner}/${table.slug}`;
  const items = table.columns.map((column) => {
    const cell = row.cells[column.id];
    const proof = cell && isFound(cell)
      ? `<blockquote>${escape(cell.quote)}</blockquote><p>Source: <a href="${escape(cell.source)}">${escape(cell.source)}</a>. Read ${escape(cell.read)}.${cell.confirmed ? " Checked by a second reader." : " Read once."}</p>`
      : cell && "missing" in cell && cell.absent ? `<p>The source was read and gives no such value.</p>` : `<p>No source we could use stated this. A blank never means no.</p>`;
    return `<section id="${escape(column.id)}"><h2>${escape(column.label)}: ${escape(shown(cell, column))}</h2><p>${escape(column.rule)}</p>${proof}</section>`;
  }).join("");
  return `<main><h1>${escape(row.key)}</h1><p>From <a href="${base}">${escape(table.title)}</a>: ${escape(table.question)}</p>${items}</main>`;
}

const inline = (text: string) => inlineParts(text).map(({ text: words, href }) => (href ? `<a href="${escape(href)}">${escape(words)}</a>` : escape(words))).join("");

/** A post as plain HTML, its live values and their proof included. */
function postText(post: Post, tables: PublishedTable[]) {
  const blocks = postBlocks(post, tables).map((block) => {
    if (block.type === "heading") return `<h2>${escape(block.text)}</h2>`;
    if (block.type === "text") return `<p>${inline(block.text)}</p>`;
    const value = isFound(block.cell) ? `${displayValue(block.cell.value)}${block.column.unit ? ` ${block.column.unit}` : ""}` : emptyLabel(block.cell);
    return `<figure><figcaption>${escape(block.rowKey)}, ${escape(block.column.label)}: ${escape(value)}</figcaption>${isFound(block.cell) ? `<blockquote>${escape(block.cell.quote)}</blockquote><p>Source: <a href="${escape(block.cell.source)}">${escape(block.cell.source)}</a>. Read ${escape(block.cell.read)}.</p>` : ""}</figure>`;
  });
  return `<main><article><h1>${escape(post.title)}</h1><p>${escape(post.date)}</p>${blocks.join("")}</article></main>`;
}

/** The first few stated values, so a search result already answers the question. */
function rowSummary(table: PublishedTable, row: Row) {
  const stated = table.columns.filter((column) => { const cell = row.cells[column.id]; return cell && isFound(cell); }).slice(0, 3);
  const parts = stated.map((column) => `${column.label}: ${shown(row.cells[column.id], column)}`);
  return `${row.key}. ${parts.length ? `${parts.join(". ")}. ` : ""}Every value links to the exact words that state it.`;
}

const creator = (table: PublishedTable) => ({ "@type": "Organization", name: table.ownerName ?? table.owner });

function tableData(table: PublishedTable, url: string, publicUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: table.title,
    description: `${table.question} ${table.scope}`.slice(0, 5000),
    url,
    creator: creator(table),
    keywords: [table.topic],
    license: "https://creativecommons.org/licenses/by/4.0/",
    isAccessibleForFree: true,
    dateModified: lastRead(table),
    variableMeasured: table.columns.map((column) => column.label),
    distribution: [
      { "@type": "DataDownload", encodingFormat: "text/csv", contentUrl: `${publicUrl}/data/${table.owner}/${table.slug}.csv` },
      { "@type": "DataDownload", encodingFormat: "application/json", contentUrl: `${publicUrl}/data/${table.owner}/${table.slug}.json` },
    ],
  };
}

const rowRead = (row: Row) => Object.values(row.cells).reduce((latest, cell) => (cell.read > latest ? cell.read : latest), "");

function rowData(table: PublishedTable, row: Row, url: string, publicUrl: string) {
  const tableUrl = `${publicUrl}/${table.owner}/${table.slug}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", name: `${row.key}: ${table.title}`, url, dateModified: rowRead(row), isPartOf: { "@type": "Dataset", name: table.title, url: tableUrl } },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: table.title, item: tableUrl },
          { "@type": "ListItem", position: 2, name: row.key, item: url },
        ],
      },
    ],
  };
}

/** Serve the app's page with the right title and description for its address, plus the files crawlers ask for. */
export function pageRoutes(app: Hono, tables: PublishedTable[], webDir: string, publicUrl: string, posts: Post[] = []) {
  const template = readFileSync(join(webDir, "index.html"), "utf8");
  // Pages go out before we know who's asking, so only public tables reach them.
  const open = () => readable(tables, everyone);

  const render = (head: string, body = "") =>
    template.replace(/<title>.*?<\/title>/, head).replace('<div id="root"></div>', `<div id="root">${body}</div>`);

  const known: Record<string, [string, string]> = {
    "/": ["Skeletable: every value shows its source", description],
    "/explore": ["Browse tables · Skeletable", "Browse public tables where every value links to its source."],
    "/about": ["About · Skeletable", description],
    "/help": ["Help · Skeletable", "How Skeletable's tables are checked, and how to use them."],
    "/accuracy": ["How accurate is Skeletable?", "How every value is checked, how many have been, and what we can't tell you."],
    "/blog": ["Blog · Skeletable", "What checking the sources turns up."],
    "/developers": ["Developers · Skeletable", "Use Skeletable's tables from agents over MCP, or as CSV and JSON."],
    "/terms": ["Terms · Skeletable", "The terms for using Skeletable."],
    "/privacy": ["Privacy · Skeletable", "What Skeletable stores, and why."],
  };

  for (const [path, [title, summary]] of Object.entries(known)) {
    app.get(path, (c) => c.html(render(headFor(title, summary, `${publicUrl}${path}`))));
  }

  app.get("/robots.txt", (c) => c.text(`User-agent: *\nDisallow: /api/\nDisallow: /auth/\nDisallow: /settings\nSitemap: ${publicUrl}/sitemap.xml\n`));

  app.get("/llms.txt", (c) =>
    c.text([
      "# Skeletable",
      "",
      `> ${description} A blank cell means no acceptable source stated the value, never that the answer is no.`,
      "",
      `MCP server: ${publicUrl}/mcp`,
      `How values are checked: ${publicUrl}/accuracy`,
      `For developers: ${publicUrl}/developers`,
      "",
      `Blog: ${publicUrl}/blog`,
      "",
      "## Tables",
      "",
      ...open().map((table) => `- [${table.title}](${publicUrl}/${table.owner}/${table.slug}): ${table.question} Data: ${publicUrl}/data/${table.owner}/${table.slug}.json`),
    ].join("\n")));

  app.get("/sitemap.xml", (c) => {
    const entries: [string, string?][] = [["/"], ["/explore"], ["/blog"], ["/accuracy"], ["/developers"], ["/help"], ...published(posts).map((post): [string, string] => [`/blog/${post.slug}`, post.date])];
    for (const table of open()) {
      const base = `/${table.owner}/${table.slug}`;
      const slugs = rowSlugs(table);
      entries.push([base, lastRead(table)]);
      for (const row of table.rows) entries.push([`${base}/row/${slugs.get(row.key)!}`, rowRead(row)]);
    }
    c.header("content-type", "application/xml");
    return c.body(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.map(([path, modified]) => `<url><loc>${escape(publicUrl + path)}</loc>${modified ? `<lastmod>${escape(modified)}</lastmod>` : ""}</url>`).join("")}</urlset>`);
  });

  // The sheet is the address people share, so its link previews name the table too.
  for (const path of ["/:owner/:slug", "/:owner/:slug/sheet"]) {
    app.get(path, (c, next) => {
      const table = open().find((t) => t.owner === c.req.param("owner") && t.slug === c.req.param("slug"));
      if (!table) return next();
      const url = `${publicUrl}/${table.owner}/${table.slug}`;
      return c.html(render(headFor(`${table.title} · Skeletable`, table.question, url, tableData(table, url, publicUrl), `/og/${table.owner}/${table.slug}.png`), tableText(table)));
    });
  }

  app.get("/:owner/:slug/row/:row", (c, next) => {
    const table = open().find((t) => t.owner === c.req.param("owner") && t.slug === c.req.param("slug"));
    if (!table) return next();
    const base = `/${table.owner}/${table.slug}`;
    const slug = c.req.param("row");
    const slugs = rowSlugs(table);
    const row = table.rows.find((candidate) => slugs.get(candidate.key) === slug);
    if (row) {
      const url = `${publicUrl}${base}/row/${slug}`;
      return c.html(render(headFor(`${row.key}: ${table.title} · Skeletable`, rowSummary(table, row), url, rowData(table, row, url, publicUrl), `/og/${table.owner}/${table.slug}.png`), rowText(table, row)));
    }
    // A row that was renamed keeps its old address, so links to it still land.
    const renamed = table.moved?.[slug];
    return renamed && slugs.has(renamed) ? c.redirect(`${base}/row/${slugs.get(renamed)!}`, 301) : next();
  });

  app.get("/blog/feed.xml", (c) => {
    c.header("content-type", "application/rss+xml; charset=utf-8");
    const items = published(posts).map((post) => `<item><title>${escape(post.title)}</title><link>${publicUrl}/blog/${post.slug}</link><guid>${publicUrl}/blog/${post.slug}</guid><pubDate>${new Date(post.date).toUTCString()}</pubDate><description>${escape(post.summary)}</description></item>`).join("");
    return c.body(`<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>Skeletable</title><link>${publicUrl}/blog</link><description>What checking the sources turns up.</description>${items}</channel></rss>`);
  });

  app.get("/blog/:slug", (c, next) => {
    const post = published(posts).find((candidate) => candidate.slug === c.req.param("slug"));
    if (!post) return next();
    const url = `${publicUrl}/blog/${post.slug}`;
    const data = { "@context": "https://schema.org", "@type": "BlogPosting", headline: post.title, description: post.summary, datePublished: post.date, url, publisher: { "@type": "Organization", name: "Skeletable" } };
    return c.html(render(headFor(`${post.title} · Skeletable`, post.summary, url, data), postText(post, open())));
  });

  app.get("/og/:owner/:file", (c, next) => {
    const table = open().find((t) => t.owner === c.req.param("owner") && `${t.slug}.png` === c.req.param("file"));
    if (!table) return next();
    c.header("content-type", "image/png");
    c.header("cache-control", "public, max-age=3600");
    return c.body(new Uint8Array(previewImage(table)));
  });

  // Anything else is an address the app handles itself.
  app.get("*", (c) => c.html(render(headFor("Skeletable", description, `${publicUrl}${c.req.path}`))));
}
