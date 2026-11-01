import { parse } from "node-html-parser";
import { parseRobots, robotsAllows } from "./robots.js";
import { safeFetch } from "./safe-fetch.js";
import { extractText } from "unpdf";
import { isFound, normalize, watchKey, type FoundCell, type Table, type WatchFile } from "./format.js";

export type Page = { status: number; contentType: string; body: string };
export type Fetcher = (url: string) => Promise<Page>;

export type CheckStatus =
  | "found" // the quote is on the page
  | "not-on-page" // the page read fine, and the quote isn't there
  | "unreadable" // a PDF, an error, or a page we couldn't reach
  | "robots"; // the site asks bots not to read it, so we didn't

export type CellCheck = { row: string; column: string; source: string; status: CheckStatus; detail?: string; stale?: string };

// Page statuses here stand for "we didn't get to look", which is different from an HTTP failure.
const ROBOTS_REFUSED = 451;
// Spec sheets run larger than web pages.
const MAX_PAGE_BYTES = 20 * 1024 * 1024;

// Page layout decides the spacing between words in separate elements, so a quote is matched without it.
const compact = (text: string) => text.replace(/\s/g, "");

/** What a reader sees on a page: its text without scripts and styles. */
export function pageText(html: string): string {
  const root = parse(html);
  root.querySelectorAll("script, style, noscript, svg").forEach((node) => node.remove());
  return normalize(root.text);
}

/** The words a page uses to say it's an old version. An old page still holds its quotes, so finding them can't show this. */
export const staleMark = (text: string) => text.match(/\b(?:superseded|effective until)\b(?: \S+)?/)?.[0];

/**
 * Open each source once and see whether every quote is really there. This shows that a quote
 * exists, not that the value was read correctly: that's what the hand-checked sample is for.
 */
export async function verifyTable(table: Table, fetcher: Fetcher, pauseMs = 1000, include: (cell: FoundCell) => boolean = () => true): Promise<CellCheck[]> {
  const sources = new Set<string>();
  for (const row of table.rows) for (const cell of Object.values(row.cells)) if (isFound(cell) && include(cell)) sources.add(cell.source);

  const pages = new Map<string, Opened>();
  for (const source of sources) {
    pages.set(source, await open(source, fetcher));
    if (pauseMs) await new Promise((resolve) => setTimeout(resolve, pauseMs));
  }

  const checks: CellCheck[] = [];
  for (const row of table.rows) {
    for (const [column, cell] of Object.entries(row.cells)) {
      if (!isFound(cell) || !include(cell)) continue;
      const page = pages.get(cell.source)!;
      const base = { row: row.key, column, source: cell.source };
      if (!("text" in page)) checks.push({ ...base, ...page });
      else checks.push({ ...base, status: compact(page.text).includes(compact(normalize(cell.quote))) ? "found" : "not-on-page", ...(staleMark(page.text) && { stale: staleMark(page.text) }) });
    }
  }
  return checks;
}

/**
 * See whether each live quote is still on its page, which needs no AI. A quote that's gone is a
 * reason for someone to look, not proof the value changed, and one that's still there doesn't prove
 * its meaning held. Archived copies can't change, so they aren't opened. A cell keeps the last day
 * its quote was seen, so a blocked site shows how long it's been rather than losing the date.
 */
export async function watchTable(table: Table, fetcher: Fetcher, ran: string, previous?: WatchFile, pauseMs = 1000): Promise<WatchFile> {
  const checks = await verifyTable(table, fetcher, pauseMs, (cell) => cell.kind !== "archived");
  const cells: WatchFile["cells"] = {};
  for (const row of table.rows) {
    for (const [column, cell] of Object.entries(row.cells)) {
      if (isFound(cell) && cell.kind === "archived") cells[watchKey(row.key, column)] = { status: "pinned" };
    }
  }
  for (const { row, column, status } of checks) {
    const key = watchKey(row, column);
    const seen = status === "found" ? ran : previous?.cells[key]?.seen;
    cells[key] = seen ? { status, seen } : { status };
  }
  return { slug: table.slug, ran, cells };
}

type Opened = { text: string } | { status: CheckStatus; detail?: string };

async function open(source: string, fetcher: Fetcher): Promise<Opened> {
  try {
    const page = await fetcher(source);
    if (page.status === ROBOTS_REFUSED) return { status: "robots" };
    if (page.status >= 400) return { status: "unreadable", detail: `HTTP ${page.status}` };
    if (/html/.test(page.contentType)) return { text: pageText(page.body) };
    if (/text\/plain/.test(page.contentType)) return { text: normalize(page.body) };
    return { status: "unreadable", detail: page.contentType };
  } catch (error) {
    return { status: "unreadable", detail: String((error as Error).message ?? error).slice(0, 120) };
  }
}

/** The polite fetcher: honours each site's robots.txt, and reports a refusal rather than reading anyway. */
export function liveFetcher(): Fetcher {
  const robots = new Map<string, ReturnType<typeof parseRobots>>();
  return async (url) => {
    const origin = new URL(url).origin;
    if (!robots.has(origin)) {
      const response = await safeFetch(`${origin}/robots.txt`, { allowHttpErrors: true, accept: "text/plain", timeoutMs: 15_000 }).catch(() => null);
      robots.set(origin, response?.status === 200 ? parseRobots(response.body.toString("utf8")) : { sitemaps: [], rules: [] });
    }
    if (!robotsAllows(robots.get(origin)!, url)) return { status: ROBOTS_REFUSED, contentType: "", body: "" };
    const response = await safeFetch(url, { allowHttpErrors: true, timeoutMs: 30_000, maxBytes: MAX_PAGE_BYTES });
    if (response.status < 400 && isPdf(response)) return { status: response.status, contentType: "text/plain", body: await pdfText(response.body) };
    return { status: response.status, contentType: response.contentType, body: response.body.toString("utf8") };
  };
}

export const isPdf = (response: { contentType: string; url: string }) => /pdf/i.test(response.contentType) || /\.pdf$/i.test(new URL(response.url).pathname);

/** The words in a PDF. Spec sheets are often the only place a maker states a number. */
export async function pdfText(data: Uint8Array): Promise<string> {
  const { text } = await extractText(new Uint8Array(data), { mergePages: true });
  return text;
}
