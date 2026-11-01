import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Cell, Column } from "@skeleton/tables/format";
import { rowSlugs } from "@skeleton/tables/share";
import type { Context, Hono } from "hono";
import { everyone, readable, type Viewer } from "./access.js";
import { OFFICIAL_ACCOUNT } from "./db.js";
import type { PublishedTable } from "./library.js";

export type Post = { slug: string; title: string; date: string; summary: string; draft: boolean; body: string };

export type PostBlock =
  | { type: "heading"; text: string }
  | { type: "text"; text: string }
  | { type: "cell"; rowKey: string; path: string; column: Column; cell: Cell };

const CELL = /^\{\{cell ([^/\s]+)\/([^/\s]+)\/([^/\s]+)\/([^/\s}]+)\}\}$/;

function parsePost(slug: string, text: string): Post {
  const match = text.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`${slug}: a post starts with its details between --- lines`);
  const details = Object.fromEntries(match[1]!.split("\n").map((line) => {
    const split = line.indexOf(":");
    return [line.slice(0, split).trim(), line.slice(split + 1).trim()];
  }));
  const { title, date, summary } = details;
  if (!title || !summary || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) throw new Error(`${slug}: a post needs a title, a date and a summary`);
  return { slug, title, date: date!, summary, draft: details.draft === "true", body: match[2]! };
}

/** Posts from the tables folder, newest first. One that's malformed stops the server, like a table that is. */
export async function loadPosts(dir: string) {
  const folder = join(dir, "posts");
  const files = await readdir(folder).catch(() => []);
  const posts = await Promise.all(files.filter((file) => file.endsWith(".md")).map(async (file) => parsePost(file.slice(0, -3), await readFile(join(folder, file), "utf8"))));
  return posts.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

export const published = (posts: Post[]) => posts.filter((post) => !post.draft);

/** A post's body as blocks. A `{{cell}}` is filled from the live table, so it's never out of step with it, and only public tables can be used. */
export function postBlocks(post: Post, tables: PublishedTable[]): PostBlock[] {
  return post.body.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean).flatMap((block): PostBlock[] => {
    if (block.startsWith("## ")) return [{ type: "heading", text: block.slice(3) }];
    const embed = block.match(CELL);
    if (!embed) return [{ type: "text", text: block.replace(/\n/g, " ") }];
    const [, owner, slug, rowSlug, columnId] = embed;
    const table = readable(tables, everyone).find((t) => t.owner === owner && t.slug === slug);
    const slugs = table && rowSlugs(table);
    const row = table?.rows.find((candidate) => slugs!.get(candidate.key) === rowSlug);
    const column = table?.columns.find((candidate) => candidate.id === columnId);
    const cell = row?.cells[columnId!];
    return row && column && cell ? [{ type: "cell", rowKey: row.key, path: `/${owner}/${slug}/row/${rowSlug}`, column, cell }] : [];
  });
}

const details = ({ body: _body, ...post }: Post) => post;

/** The blog's data. Drafts only reach the people who run the official account, so they can read one before it goes out. */
export function blogRoutes(app: Hono, posts: Post[], tables: PublishedTable[], viewerOf: (c: Context) => Promise<Viewer>) {
  const visible = async (c: Context) => ((await viewerOf(c)).accounts.includes(OFFICIAL_ACCOUNT) ? posts : published(posts));

  app.get("/api/posts", async (c) => c.json((await visible(c)).map(details)));

  app.get("/api/posts/:slug", async (c) => {
    const post = (await visible(c)).find((candidate) => candidate.slug === c.req.param("slug"));
    return post ? c.json({ ...details(post), blocks: postBlocks(post, tables) }) : c.json({ error: "No such post" }, 404);
  });
}
