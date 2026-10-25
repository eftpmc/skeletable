import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";

/** Header we set ourselves (overwriting anything the client sent) so Better Auth can rate limit per client. */
export const CLIENT_IP_HEADER = "x-closet-client-ip";

/**
 * The address of the client making this request. Behind a reverse proxy, the socket
 * address is the proxy's, so when TRUST_PROXY is on we use the last X-Forwarded-For
 * entry: the one your proxy added, which the client can't forge.
 */
export function clientIp(c: Context, trustProxy: boolean): string | null {
  if (trustProxy) {
    const forwarded = c.req.header("x-forwarded-for")?.split(",").map((part) => part.trim()).filter(Boolean);
    const last = forwarded?.at(-1);
    if (last) return last;
  }
  try {
    return getConnInfo(c).remote.address ?? null;
  } catch {
    // No socket (e.g. app.request in tests).
    return null;
  }
}

export function withClientIp(request: Request, ip: string | null): Request {
  const headers = new Headers(request.headers);
  headers.delete(CLIENT_IP_HEADER);
  if (ip) headers.set(CLIENT_IP_HEADER, ip);
  return new Request(request, { headers });
}
