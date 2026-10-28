import { describe, expect, it } from "vitest";
import {
  catalogLineSchema,
  CATALOG_FORMAT,
  extractFacts,
  fieldVersion,
  packVector,
  parseAnswer,
  parseFieldValue,
  readingSchema,
  unpackVector,
} from "../src/index.js";

describe("reading", () => {
  it("keeps what the site stated and fills empty lists", () => {
    const reading = readingSchema.parse({
      externalId: "7712",
      url: "https://shop.example/products/coat",
      title: "  Wool coat ",
      price: { amount: 24000, currency: "USD" },
    });
    expect(reading).toMatchObject({ title: "Wool coat", tags: [], images: [], variants: [] });
  });

  it("rejects prices that aren't whole minor units", () => {
    expect(() => readingSchema.parse({ externalId: "1", url: "https://a.example/p", title: "x", price: { amount: 12.5, currency: "USD" } })).toThrow();
  });
});

describe("fields", () => {
  it("checks values against the field's format and knows its version", () => {
    expect(parseFieldValue("listing", "category", "outerwear")).toBe("outerwear");
    expect(parseFieldValue("listing", "materials", ["Wool", "cashmere"])).toEqual(["wool", "cashmere"]);
    expect(() => parseFieldValue("listing", "category", "spaceships")).toThrow();
    expect(() => parseFieldValue("listing", "made-up", 1)).toThrow(/unknown listing field/);
    expect(fieldVersion("source", "sellerKind")).toBe(1);
  });
});

describe("jobs", () => {
  const answer = {
    area: "clothing", category: "outerwear", department: "women", materials: ["wool"], colours: ["camel"],
    condition: "new", origin: "IT", confidence: 0.8,
  };

  it("accepts an answer in the job's format", () => {
    expect(parseAnswer("extract-facts", extractFacts.version, answer)).toMatchObject({ category: "outerwear" });
  });

  it("refuses answers that don't fit, or for another version", () => {
    expect(() => parseAnswer("extract-facts", 1, { ...answer, category: "coats" })).toThrow();
    expect(() => parseAnswer("extract-facts", 2, answer)).toThrow(/version 1, not 2/);
    expect(() => parseAnswer("write-poems", 1, answer)).toThrow(/unknown job kind/);
  });
});

describe("catalog file", () => {
  it("reads each kind of line", () => {
    const header = { type: "header", format: CATALOG_FORMAT, licence: "ODbL-1.0", buildId: "6f1c1b2e-3c4d-4e5f-8a9b-0c1d2e3f4a5b", builtAt: "2026-10-27T12:00:00Z", resolverVersion: 1, embeddings: [] };
    expect(catalogLineSchema.parse(header).type).toBe("header");
    const listing = catalogLineSchema.parse({
      type: "listing", id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", sourceId: "6f1c1b2e-3c4d-4e5f-8a9b-0c1d2e3f4a5b",
      url: "https://shop.example/products/coat", title: "Wool coat", images: [], values: { category: "outerwear" },
    });
    expect(listing).toMatchObject({ type: "listing", embeddings: {} });
    expect(() => catalogLineSchema.parse({ ...listing, values: { category: "spaceships" } })).toThrow();
  });

  it("packs vectors into bytes and back to unit length", () => {
    const v = [0.6, -0.8, 0];
    const back = unpackVector(packVector(v));
    expect(Math.hypot(...back)).toBeCloseTo(1, 5);
    back.forEach((x, i) => expect(x).toBeCloseTo(v[i]!, 2));
  });
});
