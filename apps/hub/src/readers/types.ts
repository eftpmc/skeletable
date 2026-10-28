import type { ReadingInput } from "@skeleton/formats";
import type { SafeResponse } from "@skeleton/readers";

/**
 * What a reader gets from the crawl engine: a fetch that is already polite (robots.txt checked,
 * one request at a time with a pause between, private addresses refused). Readers only parse.
 */
export interface ReadContext {
  fetch(url: string, accept?: string): Promise<SafeResponse>;
}

export type Detection = {
  // What gave the platform away, kept on the source as the assignment's evidence.
  evidence: Record<string, unknown>;
  // The reader's per-site settings, such as the store's currency.
  config?: Record<string, unknown>;
};

/**
 * Code that reads one kind of site. Every site on that platform shares it; a site points at it
 * through its assignment. `version` goes up whenever the readings it produces change.
 */
export interface Reader {
  id: string;
  version: number;
  detect(origin: URL, ctx: ReadContext): Promise<Detection | null>;
  read(origin: URL, config: Record<string, unknown> | null, ctx: ReadContext): AsyncIterable<ReadingInput>;
  /**
   * A few products spread through the site, with what went wrong on pages that didn't read, for trying
   * a proposal quickly. Readers without it are sampled from the start of `read`.
   */
  sample?(origin: URL, config: Record<string, unknown> | null, ctx: ReadContext, n: number): Promise<{ pagesFound: number; pages: SamplePage[] }>;
}

/** One page a sample tried: its reading when it came out, and every problem found. */
export type SamplePage = { url: string; reading: ReadingInput | null; issues: string[] };
