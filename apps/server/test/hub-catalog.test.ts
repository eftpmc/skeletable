import { randomUUID } from "node:crypto";
import { packVector } from "@skeleton/formats";
import { describe, expect, it } from "vitest";
import { readHubCatalog, usd } from "../src/catalog/hub-catalog.js";

const header = { type: "header", format: 2, licence: "ODbL-1.0", buildId: randomUUID(), builtAt: "2026-10-27T12:00:00Z", resolverVersion: 1, embeddings: [] };
const look = packVector(Array.from({ length: 512 }, (_, i) => (i === 0 ? 1 : 0)));

function listing(sourceId: string, extra: Record<string, unknown> = {}) {
  return {
    type: "listing", id: randomUUID(), sourceId, url: `https://maker.example/products/${randomUUID()}`, title: "Coat", maker: "Maker Studio",
    price: { amount: 24000, currency: "USD" }, available: true, images: [{ url: "https://cdn.example/a.jpg", width: 600, height: 800 }],
    values: { category: "outerwear", department: "women" }, embeddings: { "clip-vit-b-32": look }, ...extra,
  };
}

const lines = (...rows: unknown[]) => [header, ...rows].map((r) => JSON.stringify(r));

describe("prices in dollars", () => {
  it("converts each currency from its own minor units", () => {
    expect(usd({ amount: 1250, currency: "USD" })).toBe(12.5);
    expect(usd({ amount: 9900, currency: "JPY" })).toBe(66.33);
    expect(usd({ amount: 100, currency: "XYZ" })).toBeNull();
  });
});

describe("reading the hub's catalog file", () => {
  it("turns each source into a store brand with its listings", () => {
    const id = randomUUID();
    const { records, skipped } = readHubCatalog(lines(
      { type: "source", id, domain: "maker-studio.example", values: { quality: 0.7 } },
      listing(id),
      listing(id, { price: { amount: 1000, currency: "XYZ" } }),
      listing(id, { values: {} }),
      listing(id, { embeddings: {} }),
    ));
    expect(skipped).toEqual({ noPrice: 1, noCategory: 1, noVector: 1 });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      kind: "store", name: "Maker Studio", site: "https://maker-studio.example", quality: 0.7, department: "women",
      priceLowUsd: 240, priceHighUsd: 240,
    });
    expect(records[0]!.items[0]).toMatchObject({ priceUsd: 240, category: "outerwear", department: "women", imageWidth: 600 });
  });

  it("names a store by its own name first, then its makers, then its domain", () => {
    const named = randomUUID();
    const bare = randomUUID();
    const { records } = readHubCatalog(lines(
      { type: "source", id: named, domain: "a.example", values: { name: "Atelier A" } },
      listing(named),
      { type: "source", id: bare, domain: "north-loom.example", values: {} },
      listing(bare, { maker: undefined }),
    ));
    expect(records.map((r) => r.name)).toEqual(["Atelier A", "North Loom"]);
    // Unrated stores sit just above the quality bar.
    expect(records[1]!.quality).toBe(0.5);
  });

  it("refuses a file in another format", () => {
    expect(() => readHubCatalog([JSON.stringify({ ...header, format: 1 })])).toThrow();
  });
});
