import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Table } from "@skeleton/tables/format";
import type { Hono } from "hono";
import { everyone, readable } from "./access.js";
import type { PublishedTable } from "./library.js";
import { previewImage } from "./preview.js";

const description = "A public library of tables, where each cell links to the exact words that prove it.";

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

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

/** The table as plain text, for crawlers and anyone without scripts. The app replaces it when it loads. */
const tableText = (table: Table) =>
  `<main><h1>${escape(table.title)}</h1><p>${escape(table.question)}</p><p>${escape(table.scope)}</p><ul>${table.rows.map((row) => `<li>${escape(row.key)}</li>`).join("")}</ul></main>`;

/** Serve the app's page with the right title and description for its address, plus the files crawlers ask for. */
export function pageRoutes(app: Hono, tables: PublishedTable[], webDir: string, publicUrl: string) {
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
    "/terms": ["Terms · Skeletable", "The terms for using Skeletable."],
    "/privacy": ["Privacy · Skeletable", "What Skeletable stores, and why."],
  };

  for (const [path, [title, summary]] of Object.entries(known)) {
    app.get(path, (c) => c.html(render(headFor(title, summary, `${publicUrl}${path}`))));
  }

  app.get("/robots.txt", (c) => c.text(`User-agent: *\nDisallow: /api/\nDisallow: /auth/\nDisallow: /settings\nSitemap: ${publicUrl}/sitemap.xml\n`));

  app.get("/sitemap.xml", (c) => {
    const paths = ["/", "/explore", ...open().map((table) => `/${table.owner}/${table.slug}`)];
    c.header("content-type", "application/xml");
    return c.body(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((path) => `<url><loc>${escape(publicUrl + path)}</loc></url>`).join("")}</urlset>`);
  });

  // The sheet is the address people share, so its link previews name the table too.
  for (const path of ["/:owner/:slug", "/:owner/:slug/sheet"]) {
    app.get(path, (c, next) => {
      const table = open().find((t) => t.owner === c.req.param("owner") && t.slug === c.req.param("slug"));
      if (!table) return next();
      const url = `${publicUrl}/${table.owner}/${table.slug}`;
      const data = { "@context": "https://schema.org", "@type": "Dataset", name: table.title, description: table.question, url, creator: { "@type": "Organization", name: table.owner } };
      return c.html(render(headFor(`${table.title} · Skeletable`, table.question, url, data, `/og/${table.owner}/${table.slug}.png`), tableText(table)));
    });
  }

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
