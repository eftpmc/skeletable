import { z } from "zod";
import { safeFetch, type SafeFetchOptions } from "./safe-fetch.js";
import type { Transport } from "./acquisition.js";

// This code is shipped by us, never produced by a recipe, page, or repair agent.
export const BROWSER_FUNCTION = `export default async ({ page, context }) => {
  const origin = new URL(context.url).origin;
  const allowed = new Set([origin, ...context.resourceOrigins]);
  await page.setRequestInterception(true);
  page.on('request', request => {
    let u;
    try { u = new URL(request.url()); } catch { return request.abort(); }
    const mainNavigation = request.isNavigationRequest() && request.frame() === page.mainFrame();
    if (u.protocol !== 'https:' || u.username || u.password || !allowed.has(u.origin) ||
      (mainNavigation && u.origin !== origin) || ['media', 'font'].includes(request.resourceType())) return request.abort();
    return request.continue();
  });
  const response = await page.goto(context.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  try { await page.waitForNetworkIdle({ idleTime: 500, timeout: 5000 }); } catch {}
  return { data: { url: page.url(), status: response ? response.status() : null, html: await page.content() }, type: 'application/json' };
}`;
const responseSchema = z.object({ url: z.string().url(), html: z.string().max(5 * 1024 * 1024), status: z.number().int().min(100).max(599).nullable() });

/** Admin-only experiment transport. Never expose provider configuration to public URL imports. */
export function browserlessTransport(config: {
  endpoint: string; token: string; origins: string[]; resourceOrigins?: string[];
  /** Explicit self-host/test opt-in for the provider connection, not store URLs. */
  providerFetchOptions?: Pick<SafeFetchOptions, "allowPrivate">;
}): Transport {
  const endpoint = new URL(config.endpoint);
  if ((endpoint.protocol !== "https:" && !config.providerFetchOptions?.allowPrivate) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== "/function") {
    throw new Error("Use a trusted Browserless /function endpoint without credentials or query parameters");
  }
  if (!config.token) throw new Error("Browserless token is required");
  for (const origin of [...config.origins, ...config.resourceOrigins ?? []]) {
    const u = new URL(origin);
    if (u.protocol !== "https:" || u.origin !== origin || !u.hostname.includes(".") || /^\[|^[\d.]+$/.test(u.hostname)) throw new Error("Browser origins must be explicit public HTTPS hostnames");
  }
  endpoint.searchParams.set("token", config.token);
  return {
    async fetch(input) {
      const target = new URL(input);
      if (!config.origins.includes(target.origin) || target.username || target.password || target.protocol !== "https:") throw new Error("Browser target outside approved origins");
      // No redirect following on the provider request: never forward its secret to another service.
      try {
        const response = await safeFetch(endpoint.toString(), {
          ...config.providerFetchOptions, method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ code: BROWSER_FUNCTION, context: { url: target.toString(), resourceOrigins: config.resourceOrigins ?? [] } }),
          maxRedirects: 0, maxBytes: 6 * 1024 * 1024, timeoutMs: 25000,
        });
        const json = JSON.parse(response.body.toString("utf8"));
        const doc = responseSchema.parse(json.data ?? json);
        const final = new URL(doc.url);
        if (final.origin !== target.origin || final.username || final.password) throw new Error("Unexpected browser navigation");
        return { ...doc, observedAt: new Date().toISOString(), transport: "browser" };
      } catch { throw new Error("Browser provider failed; inspect provider logs without exposing credentials"); }
    },
  };
}
