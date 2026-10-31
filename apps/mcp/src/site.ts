import { isFound, type Cell, type Column, type FoundCell, type Table } from "@skeleton/tables/format";
import { html, raw } from "hono/html";
import { searchTables, summarize } from "./library.js";
import { style } from "./style.js";

const kindLabels: Record<FoundCell["kind"], string> = {
  "first-hand": "The owner's own page",
  archived: "A dated public copy of the owner's page",
  "second-hand": "Someone else reporting it",
};

/** Moves focus into the evidence panel and back, and closes it on Escape. Without this the panel still opens and closes. */
const script = `
let cell;
const sync = () => {
  document.querySelectorAll("[aria-current]").forEach((a) => a.removeAttribute("aria-current"));
  const id = location.hash.slice(1);
  const panel = id && document.getElementById(id);
  if (panel) {
    cell = document.querySelector('a[href="#' + id + '"]');
    cell?.setAttribute("aria-current", "true");
    panel.focus({ preventScroll: true });
  } else {
    cell?.focus({ preventScroll: true });
    cell = undefined;
  }
};
addEventListener("hashchange", sync);
addEventListener("keydown", (event) => { if (event.key === "Escape" && cell) location.hash = "_"; });
sync();
`;

const page = (title: string, body: unknown, wide = false) => html`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <link rel="icon" href="data:," />
    <style>${raw(style)}</style>
  </head>
  <body>
    <div class="wrap${wide ? " wide" : ""}">
      <a class="brand" href="/">skeleton</a>
      ${body}
    </div>
  </body>
</html>`;

const day = (date: string) =>
  new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

const host = (url: string) => new URL(url).hostname.replace(/^www\./, "");

const external = (url: string, text: string) => html`<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`;

const display = (value: FoundCell["value"]) => (typeof value === "boolean" ? (value ? "Yes" : "No") : String(value));

const withUnit = (cell: FoundCell, column: Column) =>
  column.unit ? `${display(cell.value)} ${column.unit}` : display(cell.value);

const slugOf = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const cellId = (rowKey: string, column: Column) => `${slugOf(rowKey)}--${column.id}`;

function evidence(rowKey: string, column: Column, cell: Cell) {
  const details = isFound(cell)
    ? html`<p class="value">${withUnit(cell, column)}</p>
        <blockquote>${cell.quote}</blockquote>
        <dl>
          <dt>Source</dt>
          <dd>${external(cell.source, host(cell.source))}</dd>
          <dt>Kind</dt>
          <dd>${kindLabels[cell.kind]}</dd>
          <dt>Read</dt>
          <dd>${day(cell.read)}</dd>
        </dl>`
    : html`<p class="value">Not stated</p>
        <p>No source we could use stated this. We looked here on ${day(cell.read)}:</p>
        <ul class="checked">
          ${cell.checked.map((url) => html`<li>${external(url, host(url))}</li>`)}
        </ul>`;
  return html`<section class="evidence" id="${cellId(rowKey, column)}" tabindex="-1" aria-label="Evidence">
    <h2>${rowKey} · ${column.label}</h2>
    <a class="close" href="#_">Close</a>
    ${details}
    <p class="rule">${column.rule}</p>
  </section>`;
}

/** The library: every table, or those matching a search. */
export function homePage(tables: Table[], query: string, origin: string) {
  const found = searchTables(tables, query);
  const list = found.length
    ? html`<ul class="list">
        ${found.map((table) => {
          const summary = summarize(table);
          return html`<li>
            <a href="/tables/${table.slug}">
              <span class="name">${table.title}</span>
              <p>${table.question}</p>
              <span class="meta">${summary.rows} rows · ${summary.filled} filled · read ${day(summary.lastRead)}</span>
            </a>
          </li>`;
        })}
      </ul>`
    : html`<p class="dim">No table covers “${query}”. <a href="/">See all tables</a></p>`;
  return page(
    "skeleton",
    html`<p class="lead">Tables where every value shows its source.</p>
      <form action="/" role="search">
        <label class="hidden" for="q">Search the tables</label>
        <input id="q" type="search" name="q" value="${query}" placeholder="Search the tables" />
      </form>
      ${list}
      <p class="connect">
        Read these from an agent:
        <code>claude mcp add --transport http skeleton ${origin}/mcp</code>
      </p>`,
  );
}

/** One table. Each value links to its evidence, so every cell has its own address. */
export function tablePage(table: Table) {
  const { filled, lastRead } = summarize(table);
  const numeric = (column: Column) => (column.type === "number" ? "number" : undefined);
  return page(
    `${table.title} · skeleton`,
    html`<h1>${table.title}</h1>
      <p class="question dim">${table.question}</p>
      <div class="scroll" tabindex="0" role="region" aria-label="${table.title}">
        <table>
          <thead>
            <tr>
              <th scope="col"><span class="hidden">Name</span></th>
              ${table.columns.map(
                (column) =>
                  html`<th scope="col" class="${numeric(column)}">${column.label}${column.unit ? ` (${column.unit})` : ""}</th>`,
              )}
            </tr>
          </thead>
          <tbody>
            ${table.rows.map(
              (row) => html`<tr>
                <th scope="row">${row.key}</th>
                ${table.columns.map((column) => {
                  const cell = row.cells[column.id]!;
                  const href = `#${cellId(row.key, column)}`;
                  return html`<td class="${numeric(column)}">
                    ${isFound(cell)
                      ? html`<a href="${href}">${display(cell.value)}</a>`
                      : html`<a class="missing" href="${href}">Not stated</a>`}
                  </td>`;
                })}
              </tr>`,
            )}
          </tbody>
        </table>
      </div>
      <p class="meta">Select a value to see its source · ${filled} filled · read ${day(lastRead)}</p>
      <p class="scope">${table.scope}</p>
      ${table.rows.flatMap((row) => table.columns.map((column) => evidence(row.key, column, row.cells[column.id]!)))}
      <script>${raw(script)}</script>`,
    true,
  );
}

/** What a wrong address gets. */
export const notFoundPage = () =>
  page("Not found · skeleton", html`<p class="lead">There's no page here.</p><a href="/">See all tables</a>`);
