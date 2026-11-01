import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { inlineParts } from "@skeleton/tables/share";
import { createApp } from "../src/app.js";
import { loadTables } from "../src/library.js";
import { loadPosts, postBlocks, type Post } from "../src/posts.js";

const root = fileURLToPath(new URL("../../../tables", import.meta.url));
const tables = await loadTables(root);

const post: Post = {
  slug: "live",
  title: "A live post",
  date: "2026-11-01",
  summary: "A summary.",
  draft: false,
  body: "Words with a [link](https://a.example/x).\n\n## A heading\n\n{{cell skeletable/data-breach-laws/texas/notify_days}}\n\n{{cell skeletable/data-breach-laws/nowhere/notify_days}}",
};

describe("the blog", () => {
  let dir: string;
  let site: ReturnType<typeof createApp>;
  const text = async (path: string) => (await site.request(path)).text();

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "web-"));
    await writeFile(join(dir, "index.html"), '<title>site</title><div id="root"></div>');
    site = createApp(tables, dir, undefined, [post, { ...post, slug: "hidden", title: "A hidden draft", draft: true }]);
  });

  afterAll(() => rm(dir, { recursive: true }));

  it("fills a post's cells from the live table, and drops one that's gone", () => {
    const blocks = postBlocks(post, tables);
    expect(blocks.map((block) => block.type)).toEqual(["text", "heading", "cell"]);
    expect(blocks[2]).toMatchObject({ rowKey: "Texas", path: "/skeletable/data-breach-laws/row/texas", cell: { value: 60 } });
  });

  it("won't fill a cell from a private table", () => {
    const hidden = tables.map((table) => ({ ...table, private: true }));
    expect(postBlocks(post, hidden).map((block) => block.type)).toEqual(["text", "heading"]);
  });

  it("puts a post in its page, proof included, with a link people can follow", async () => {
    const page = await text("/blog/live");
    expect(page).toContain("<title>A live post · Skeletable</title>");
    expect(page).toContain('<a href="https://a.example/x">link</a>');
    expect(page).toContain("Texas, Days to tell residents: 60 days");
    expect(page).toContain("<blockquote>");
    expect(page).toContain('"@type":"BlogPosting"');
  });

  it("keeps drafts out of everything public", async () => {
    expect(((await (await site.request("/api/posts")).json()) as { slug: string }[]).map((item) => item.slug)).toEqual(["live"]);
    expect((await site.request("/api/posts/hidden")).status).toBe(404);
    for (const path of ["/blog/hidden", "/sitemap.xml", "/blog/feed.xml", "/llms.txt"]) expect(await text(path)).not.toContain("A hidden draft");
    expect(await text("/sitemap.xml")).not.toContain("/blog/hidden");
  });

  it("lists published posts in the sitemap and the feed", async () => {
    expect(await text("/sitemap.xml")).toContain("/blog/live</loc><lastmod>2026-11-01");
    expect(await text("/blog/feed.xml")).toContain("<title>A live post</title>");
  });

  it("only links to web and site addresses", () => {
    expect(inlineParts("see [a](https://a.example) and [b](/x) or [c](javascript:alert(1))")).toEqual([
      { text: "see " },
      { text: "a", href: "https://a.example" },
      { text: " and " },
      { text: "b", href: "/x" },
      { text: " or [c](javascript:alert(1))" },
    ]);
  });

  it("loads the real posts, and every cell they use exists", async () => {
    const posts = await loadPosts(root);
    expect(posts.length).toBeGreaterThan(0);
    for (const item of posts) {
      const wanted = item.body.match(/\{\{cell /g)?.length ?? 0;
      expect(postBlocks(item, tables).filter((block) => block.type === "cell")).toHaveLength(wanted);
    }
  });

  it("refuses a malformed post", async () => {
    const folder = await mkdtemp(join(tmpdir(), "posts-"));
    await mkdir(join(folder, "posts"));
    await writeFile(join(folder, "posts", "bad.md"), "no details here");
    await expect(loadPosts(folder)).rejects.toThrow("bad");
    await rm(folder, { recursive: true });
  });
});
