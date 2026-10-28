import { type Db, schema } from "@skeleton/db";
import { eq } from "drizzle-orm";
import { parse } from "node-html-parser";
import sharp from "sharp";
import { type SafeFetchOptions, safeFetch } from "@skeleton/readers";
import type { Storage } from "../storage.js";

const SIZE = 64;
/** Stores whose icon couldn't be found are retried after a day. */
const MISS_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Each store's own icon (apple-touch-icon, <link rel="icon"> or favicon.ico), fetched from the
 * store's site once, scaled to 64px PNG and kept in storage. Only domains we have offers from.
 * Big retailers often turn away bots or only ship tiny bitmap favicons, so Google's favicon
 * service is the last resort unless turned off.
 */
export class StoreIcons {
  private readonly misses = new Map<string, number>();
  private readonly pending = new Map<string, Promise<Buffer | null>>();

  constructor(
    private readonly db: Db,
    private readonly storage: Storage,
    private readonly options: { protocol: "https" | "http"; allowPrivate: boolean; fallback: "google" | "none" },
  ) {}

  async get(domain: string): Promise<Buffer | null> {
    const key = `store-icons/${domain.replace(/[^a-z0-9.-]/gi, "_")}.png`;
    const cached = await this.storage.get(key);
    if (cached) return cached;
    if (Date.now() - (this.misses.get(domain) ?? 0) < MISS_TTL_MS) return null;

    const [known] = await this.db.select({ id: schema.store.id }).from(schema.store).where(eq(schema.store.domain, domain)).limit(1);
    if (!known) return null;

    let job = this.pending.get(domain);
    if (!job) {
      job = this.fetchIcon(domain)
        .then(async (icon) => {
          if (icon) await this.storage.put(key, icon);
          else this.misses.set(domain, Date.now());
          return icon;
        })
        .finally(() => this.pending.delete(domain));
      this.pending.set(domain, job);
    }
    return job;
  }

  private async fetchIcon(domain: string): Promise<Buffer | null> {
    const origin = `${this.options.protocol}://${domain}`;
    const fetchOptions: SafeFetchOptions = { allowPrivate: this.options.allowPrivate, timeoutMs: 5000, maxBytes: 2_000_000 };

    const candidates: string[] = [];
    try {
      const page = await safeFetch(origin, { ...fetchOptions, accept: "text/html" });
      candidates.push(...iconLinks(page.body.toString("utf8"), page.url));
    } catch {
      // No homepage; the well-known paths below may still work.
    }
    candidates.push(`${origin}/apple-touch-icon.png`, `${origin}/favicon.ico`);
    if (this.options.fallback === "google") {
      candidates.push(`https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(domain)}`);
    }

    for (const url of [...new Set(candidates)]) {
      try {
        const { body } = await safeFetch(url, { ...fetchOptions, accept: "image/*" });
        const icon = await toPng(body);
        if (icon) return icon;
      } catch {
        // Try the next one.
      }
    }
    return null;
  }
}

/** Icon links from a page, biggest first: apple-touch-icon, then rel="icon" by declared size. */
export function iconLinks(html: string, pageUrl: string): string[] {
  const links = parse(html)
    .querySelectorAll("link[rel][href]")
    .map((link) => {
      const rel = (link.getAttribute("rel") ?? "").toLowerCase().split(/\s+/);
      const size = Number.parseInt(link.getAttribute("sizes") ?? "", 10) || 0;
      const touch = rel.includes("apple-touch-icon") || rel.includes("apple-touch-icon-precomposed");
      if (!touch && !rel.includes("icon")) return null;
      try {
        return { url: new URL(link.getAttribute("href")!, pageUrl).toString(), score: (touch ? 1000 : 0) + size };
      } catch {
        return null;
      }
    })
    .filter((link) => link !== null);
  return links.sort((a, b) => b.score - a.score).map((link) => link.url);
}

/** Decode PNG/JPEG/WebP/SVG/GIF (or the biggest PNG inside an .ico) to a square 64px PNG. */
export async function toPng(data: Buffer): Promise<Buffer | null> {
  const input = isIco(data) ? largestPngInIco(data) : data;
  if (!input) return null;
  try {
    const image = sharp(input, { limitInputPixels: 4_000_000, density: 300 });
    const { width = 0, height = 0 } = await image.metadata();
    if (width < 16 || height < 16) return null;
    return await image
      .resize(SIZE, SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}

const isIco = (data: Buffer) => data.length > 6 && data.readUInt16LE(0) === 0 && data.readUInt16LE(2) === 1;

/** Modern .ico files hold PNG images; old BMP-only ones are skipped. */
function largestPngInIco(data: Buffer): Buffer | null {
  const count = data.readUInt16LE(4);
  let best: { size: number; png: Buffer } | null = null;
  for (let i = 0; i < count; i++) {
    const entry = 6 + i * 16;
    if (entry + 16 > data.length) break;
    const size = data[entry] || 256;
    const length = data.readUInt32LE(entry + 8);
    const offset = data.readUInt32LE(entry + 12);
    const image = data.subarray(offset, offset + length);
    const isPng = image.length > 8 && image.readUInt32BE(0) === 0x89504e47;
    if (isPng && (!best || size > best.size)) best = { size, png: image };
  }
  return best?.png ?? null;
}
