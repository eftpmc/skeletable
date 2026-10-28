import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeFetch } from "@closet/readers";
import { shopifySource } from "../src/search/sources/shopify.js";
import { SearchService } from "../src/search/service.js";
import type { Db } from "@closet/db";

vi.mock("@closet/readers", async (importOriginal) => ({ ...await importOriginal<typeof import("@closet/readers")>(), safeFetch: vi.fn() }));
const fetch = vi.mocked(safeFetch);
const shop = { domain: "shop.example", name: "Shop", condition: "new" as const, currency: "USD" };
const response = (body: unknown) => ({ url: "https://shop.example/search/suggest.json", status: 200, headers: {}, contentType: "application/json", body: Buffer.from(JSON.stringify(body)) });
beforeEach(() => {
  fetch.mockReset();
});

describe("Shopify search health", () => {
  it("reports an upstream outage instead of a successful empty search", async () => {
    fetch.mockRejectedValue(new Error("timeout"));
    const search = new SearchService({} as Db, [shopifySource([shop])], {});
    const result = await search.search("jacket");
    expect(result.results).toEqual([]);
    expect(result.sources[0]?.status).toBe("error");
  });
  it("reports malformed upstream JSON as failure", async () => {
    fetch.mockResolvedValue(response({ error: "unavailable" }));
    await expect(shopifySource([shop]).search({ text: "jacket", limit: 10 }, { fetchOptions: {} })).rejects.toThrow();
  });
  it("preserves a genuine empty result", async () => {
    fetch.mockResolvedValue(response({ resources: { results: { products: [] } } }));
    const result = await new SearchService({} as Db, [shopifySource([shop])], {}).search("jacket");
    expect(result.sources[0]?.status).toBe("ok");
    expect(result.results).toEqual([]);
  });
  it("retains offers from a responding shop when another shop fails", async () => {
    fetch.mockResolvedValueOnce(response({ resources: { results: { products: [{ title: "Field Jacket", url: "/products/jacket", price: "100.00", available: true }] } } })).mockRejectedValueOnce(new Error("down"));
    const offers = await shopifySource([shop, { ...shop, domain: "other.example" }]).search({ text: "jacket", limit: 10 }, { fetchOptions: {} });
    expect(offers).toHaveLength(1);
    expect(offers[0]?.title).toBe("Field Jacket");
  });
});
