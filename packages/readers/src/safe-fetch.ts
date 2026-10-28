import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import zlib from "node:zlib";

/**
 * Fetch a URL the user gave us without letting it reach private networks (SSRF).
 * Addresses are checked at connect time, so DNS tricks can't swap in an internal IP,
 * and every redirect hop is checked again.
 */

export class FetchError extends Error {
  constructor(
    message: string,
    readonly code: "invalid_url" | "blocked" | "timeout" | "too_large" | "http_error" | "network",
    readonly status?: number,
  ) {
    super(message);
  }
}

export type SafeFetchOptions = {
  /** Let storefront readers inspect error pages; network/SSRF protections still apply. */
  allowHttpErrors?: boolean;
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  accept?: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  /** Allow private and loopback addresses. Only for tests and explicit self-host opt-in. */
  allowPrivate?: boolean;
};

export type SafeResponse = {
  url: string;
  status: number;
  contentType: string;
  body: Buffer;
};

export const USER_AGENT = "Mozilla/5.0 (compatible; SkeletonBot/0.1; +https://github.com/eftpmc/skeleton)";

export async function safeFetch(input: string, options: SafeFetchOptions = {}): Promise<SafeResponse> {
  const { maxRedirects = 5 } = options;
  let url = parseUrl(input);
  let hopOptions = options;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const response = await request(url, hopOptions);
    if (response.status >= 300 && response.status < 400 && response.location) {
      url = parseUrl(new URL(response.location, url).toString());
      // Like browsers, follow a redirect with a plain GET.
      hopOptions = { ...options, method: "GET", body: undefined };
      continue;
    }
    if (response.status >= 400 && !options.allowHttpErrors) {
      throw new FetchError(`Request failed with status ${response.status}`, "http_error", response.status);
    }
    return { url: url.toString(), status: response.status, contentType: response.contentType, body: response.body };
  }
  throw new FetchError("Too many redirects", "network");
}

function parseUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new FetchError("Not a valid URL", "invalid_url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new FetchError("Only http and https links are supported", "invalid_url");
  }
  if (url.username || url.password) throw new FetchError("Links with credentials are not supported", "invalid_url");
  return url;
}

type RawResponse = { status: number; location?: string; contentType: string; body: Buffer };

function request(url: URL, options: SafeFetchOptions): Promise<RawResponse> {
  const { maxBytes = 5 * 1024 * 1024, timeoutMs = 10_000, allowPrivate = false } = options;
  const hostname = url.hostname.replace(/^\[|\]$/g, "");

  if (net.isIP(hostname) && !allowPrivate && isPrivateAddress(hostname)) {
    return Promise.reject(new FetchError("That address isn't allowed", "blocked"));
  }

  const lookup: net.LookupFunction = (host, lookupOptions, callback) => {
    dns.lookup(host, { all: true }, (error, addresses) => {
      if (error) return callback(error, "", 4);
      if (!allowPrivate && addresses.some((entry) => isPrivateAddress(entry.address))) {
        return callback(new FetchError("That address isn't allowed", "blocked"), "", 4);
      }
      if (lookupOptions.all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, addresses);
      const first = addresses[0];
      if (!first) return callback(new Error("No addresses found"), "", 4);
      callback(null, first.address, first.family);
    });
  };

  const transport = url.protocol === "https:" ? https : http;

  return new Promise<RawResponse>((resolve, reject) => {
    const req = transport.request(
      url,
      {
        method: options.method ?? "GET",
        lookup,
        timeout: timeoutMs,
        headers: {
          "user-agent": USER_AGENT,
          accept: options.accept ?? "*/*",
          "accept-encoding": "gzip, deflate, br",
          "accept-language": "en-US,en;q=0.9",
          ...options.headers,
          ...(options.body !== undefined ? { "content-length": String(Buffer.byteLength(options.body)) } : {}),
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolve({ status, location: res.headers.location, contentType: "", body: Buffer.alloc(0) });
        }

        const declared = Number(res.headers["content-length"]);
        if (declared > maxBytes) {
          res.destroy();
          return reject(new FetchError("The response is too large", "too_large"));
        }

        const encoding = String(res.headers["content-encoding"] ?? "").toLowerCase();
        const stream =
          encoding === "gzip"
            ? res.pipe(zlib.createGunzip())
            : encoding === "br"
              ? res.pipe(zlib.createBrotliDecompress())
              : encoding === "deflate"
                ? res.pipe(zlib.createInflate())
                : res;

        const chunks: Buffer[] = [];
        let size = 0;
        stream.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            req.destroy();
            stream.destroy();
            reject(new FetchError("The response is too large", "too_large"));
            return;
          }
          chunks.push(chunk);
        });
        stream.on("end", () =>
          resolve({ status, contentType: String(res.headers["content-type"] ?? ""), body: Buffer.concat(chunks) }),
        );
        stream.on("error", (error) => reject(new FetchError(error.message, "network")));
      },
    );
    req.on("timeout", () => req.destroy(new FetchError("The site took too long to respond", "timeout")));
    req.on("error", (error) => reject(error instanceof FetchError ? error : new FetchError(error.message, "network")));
    req.end(options.body);
  });
}

const blockedV4: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

const blockList = new net.BlockList();
for (const [address, prefix] of blockedV4) blockList.addSubnet(address, prefix, "ipv4");
blockList.addAddress("::", "ipv6");
blockList.addAddress("::1", "ipv6");
blockList.addSubnet("fc00::", 7, "ipv6");
blockList.addSubnet("fe80::", 10, "ipv6");
blockList.addSubnet("ff00::", 8, "ipv6");

export function isPrivateAddress(address: string): boolean {
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) return blockList.check(mapped[1]!, "ipv4");
  const family = net.isIP(address);
  if (family === 4) return blockList.check(address, "ipv4");
  if (family === 6) return blockList.check(address, "ipv6");
  return true;
}
