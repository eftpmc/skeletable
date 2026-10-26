import { describe, expect, it } from "vitest";
import { matchKey, normalizeGtin, parseCondition, relevance } from "../src/search/normalize.js";
import { parseShopifyStores } from "../src/search/sources/shopify.js";
import { verdictFor } from "../src/search/verdict.js";

describe("normalize", () => {
  it("scores relevance by query words found", () => {
    expect(relevance("sony xm5 headphones", "Sony WH-1000XM5 Wireless Headphones", null)).toBeCloseTo(2 / 3);
    expect(relevance("sony headphones", "Sony WH-1000XM5 Wireless Headphones", null)).toBe(1);
    expect(relevance("sony headphones", "Phone case", null)).toBe(0);
    expect(relevance("carhartt jacket", "Detroit Jacket", "Carhartt WIP")).toBe(1);
  });

  it("builds the same match key for the same product across stores", () => {
    expect(matchKey("Sony", "Sony WH-1000XM5 (Black)")).toBe(matchKey(null, "SONY WH-1000XM5 - Renewed"));
  });

  it("maps condition wording", () => {
    expect(parseCondition("Certified Refurbished")).toBe("refurb");
    expect(parseCondition("Pre-Owned")).toBe("used");
    expect(parseCondition("Brand New")).toBe("new");
    expect(parseCondition(undefined)).toBe("new");
  });

  it("normalizes GTINs so UPC and EAN forms match", () => {
    expect(normalizeGtin("027242923232")).toBe(normalizeGtin("0027242923232"));
    expect(normalizeGtin("abc")).toBeNull();
  });

  it("parses the Shopify store list", () => {
    expect(parseShopifyStores("shop.example.com, vintage.example.com|used|EUR|name=Second Spin")).toEqual([
      { domain: "shop.example.com", name: "Shop", condition: "new", currency: "USD" },
      { domain: "vintage.example.com", name: "Second Spin", condition: "used", currency: "EUR" },
    ]);
  });
});

describe("verdictFor", () => {
  it("uses price history when there is enough", () => {
    expect(verdictFor(27900, [34900, 33000, 29900, 27900], [])).toEqual({ label: "good", text: "Lowest in 60 days" });
    expect(verdictFor(39900, [34900, 34900, 33000], [])).toEqual({ label: "high", text: "Usually $349" });
    expect(verdictFor(33000, [34900, 30000, 33000], []).label).toBe("typical");
  });

  it("falls back to comparing stores", () => {
    expect(verdictFor(27900, [], [29800, 31000])).toEqual({ label: "good", text: "$19 less than the next store" });
    expect(verdictFor(27900, [], [28000]).label).toBe("typical");
    expect(verdictFor(27900, [], []).label).toBe("unknown");
  });
});
