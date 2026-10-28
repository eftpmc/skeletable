import { describe, expect, it } from "vitest";
import { matchingProduct } from "../src/search/matching.js";

const base = { brand: "Acme", gtin: null, mpn: null, model: "ab1234", matchKey: "acme ab1234" };

describe("product identity", () => {
  it("vetoes a matching model or title when barcodes disagree", () => {
    expect(matchingProduct({ ...base, gtin: "111" }, [{ ...base, gtin: "222" }])).toBeUndefined();
  });

  it("vetoes different manufacturer variants", () => {
    expect(matchingProduct({ ...base, mpn: "AB1234/B" }, [{ ...base, mpn: "AB1234/W" }])).toBeUndefined();
  });

  it("scopes manufacturer part numbers to the brand", () => {
    expect(matchingProduct({ ...base, mpn: "AB1234" }, [{ ...base, mpn: "AB1234", brand: "Other" }])).toBeUndefined();
  });

  it("accepts matching barcodes despite inconsistent manufacturer metadata", () => {
    const candidate = { ...base, gtin: "111", mpn: "AB1234/B" };
    expect(matchingProduct({ ...base, gtin: "111", mpn: "AB1234" }, [candidate])).toBe(candidate);
  });

  it("allows a compatible model fallback with missing identifiers", () => {
    const candidate = { ...base, gtin: "111" };
    expect(matchingProduct(base, [candidate])).toBe(candidate);
  });

  it("does not guess between different barcode variants", () => {
    expect(matchingProduct(base, [{ ...base, gtin: "111" }, { ...base, gtin: "222" }])).toBeUndefined();
  });

  it("prefers a known barcode over ambiguous model names", () => {
    const candidate = { ...base, gtin: "222" };
    expect(matchingProduct(candidate, [{ ...base, gtin: "111" }, candidate])).toBe(candidate);
  });
});
