import type { Cell, Column, FoundCell } from "@skeleton/tables/format";
import { emptyLabel, inlineParts } from "@skeleton/tables/share";
import { useEffect } from "react";
import { Link } from "wouter";
import { ListSkeleton } from "@/components/Loading";
import { Content, EmptyState, LoadFailed, PageHeader } from "@/components/Layout";
import { NotFoundContent } from "@/pages/Message";
import { ProofDetails, citation } from "@/components/Proof";
import { Page } from "@/components/Shell";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useJson } from "@/lib/api";
import { day, display } from "@/lib/cells";
import { copyText } from "@/lib/copy";

type PostDetails = { slug: string; title: string; date: string; summary: string; draft: boolean };
type Block = { type: "heading"; text: string } | { type: "text"; text: string } | { type: "cell"; rowKey: string; path: string; column: Column; cell: Cell };

const isFound = (cell: Cell): cell is FoundCell => !("missing" in cell) && !("origin" in cell);

const Draft = () => <Badge variant="outline">Draft</Badge>;

/** Everything we've written, newest first. */
export function BlogIndex() {
  const { data, status, retry } = useJson<PostDetails[]>("/api/posts");

  useEffect(() => {
    document.title = "Blog · Skeletable";
  }, []);

  return (
    <Page crumbs={[{ label: "Blog" }]}>
      <Content size="narrow">
        <PageHeader title="Blog" description="What checking the sources turns up." />
        {status === "failed" ? (
          <LoadFailed what="The blog" retry={retry} />
        ) : !data ? (
          <ListSkeleton label="Loading posts" rows={3} />
        ) : data.length ? (
          <ul aria-label="Posts" className="divide-y border-y">
            {data.map((post) => (
              <li key={post.slug}>
                <Link href={`/blog/${post.slug}`} className="group block px-2 py-6 transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:px-4">
                  <span className="flex flex-wrap items-center gap-2"><span className="text-lg font-semibold tracking-tight group-hover:text-brand">{post.title}</span>{post.draft && <Draft />}</span>
                  <span className="mt-2 block text-sm leading-relaxed text-muted-foreground">{post.summary}</span>
                  <span className="mt-3 block text-xs text-muted-foreground">{day(post.date)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Nothing here yet" body="Findings from checking the sources will appear here." />
        )}
      </Content>
    </Page>
  );
}

/** Words with their links. Addresses on this site stay in the app. */
const Inline = ({ text }: { text: string }) =>
  inlineParts(text).map(({ text: words, href }, index) => {
    if (!href) return <span key={index}>{words}</span>;
    if (href.startsWith("/")) return <Link key={index} href={href} className="underline">{words}</Link>;
    return <a key={index} href={href} target="_blank" rel="noopener noreferrer" className="underline">{words}</a>;
  });

/** A value from a live table, with its proof, so a post can't drift from the data. */
function LiveCell({ block, url }: { block: Extract<Block, { type: "cell" }>; url: string }) {
  const { rowKey, path, column, cell } = block;
  return (
    <figure className="space-y-2 rounded-xl border p-4">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3">
        <Link href={path} className="font-medium hover:underline">{rowKey} · {column.label}</Link>
        <span className="text-base font-semibold">{!("missing" in cell) ? `${display(cell.value)}${column.unit ? ` ${column.unit}` : ""}` : <span className="font-normal text-muted-foreground">{emptyLabel(cell)}</span>}</span>
      </figcaption>
      {isFound(cell) && <ProofDetails cell={cell} cite={<Button variant="ghost" size="xs" onClick={() => copyText(citation(cell, rowKey, url), "Citation copied")}>Cite</Button>} />}
    </figure>
  );
}

export function BlogPost({ slug }: { slug: string }) {
  const { data, status, retry } = useJson<PostDetails & { blocks: Block[] }>(`/api/posts/${slug}`);

  useEffect(() => {
    if (data) document.title = `${data.title} · Skeletable`;
  }, [data]);

  return (
    <Page crumbs={[{ label: "Blog", href: "/blog" }, { label: data?.title ?? "Post" }]}>
      <Content size="narrow">
        {status === "missing" ? (
          <NotFoundContent />
        ) : status === "failed" ? (
          <LoadFailed what="This post" retry={retry} />
        ) : data ? (
          <article>
            <PageHeader title={data.title} description={<span className="flex items-center gap-2">{day(data.date)}{data.draft && <Draft />}</span>} />
            <div className="space-y-4 leading-relaxed">
              {data.blocks.map((block, index) =>
                block.type === "heading" ? <h2 key={index} className="pt-2 text-lg font-semibold">{block.text}</h2>
                  : block.type === "text" ? <p key={index}><Inline text={block.text} /></p>
                    : <LiveCell key={index} block={block} url={`${location.origin}/blog/${slug}`} />,
              )}
            </div>
          </article>
        ) : (
          <div role="status" aria-label="Loading post" className="space-y-6"><span className="sr-only">Loading post</span><Skeleton className="h-9 w-4/5" /><Skeleton className="h-3 w-28" />{[0, 1, 2].map((index) => <div key={index} aria-hidden="true" className="space-y-3"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /></div>)}</div>
        )}
      </Content>
    </Page>
  );
}
