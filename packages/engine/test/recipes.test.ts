import { describe, expect, it } from "vitest";
import { extractRecipe, parseAmount, recipeSchema, type Recipe } from "../src/recipes.js";

const recipe: Recipe = {
  id: "demo-store", version: 1, origin: "https://store.example.com", pathPrefix: "/products/",
  title: { selector: "h1" }, price: { selector: ".legacy-price" }, currency: { constant: "USD" },
  variants: { selector: ".size", label: { selector: ":scope", attribute: "data-size" },
    stock: { field: { selector: ":scope", attribute: "data-stock" }, inStock: ["yes"], outOfStock: ["no"] } },
};
const url = "https://store.example.com/products/jacket";
const html = `<h1>Jacket</h1><div class="legacy-price current-price">$200</div>
  <div id="installment-price">$50</div>
  <button class="size" data-size="M" data-stock="yes">M</button><button class="size" data-size="L" data-stock="no">L</button>`;

describe("recipe extraction", () => {
  it.each([["$1,898", 189800], ["USD 19.95", 1995], ["$0", 0], ["1,89", null], ["$20/month", null], ["$20 - $80", null], ["was $80 now $20", null]])("parses %s conservatively", (raw, expected) => {
    expect(parseAmount(String(raw))).toBe(expected);
  });
  it("records field evidence and explicit per-size availability", () => {
    const result = extractRecipe(html, url, recipe);
    expect(result.product).toEqual({ title: "Jacket", priceCents: 20000, currency: "USD", availability: "unknown", variants: [
      { label: "M", availability: "in_stock" }, { label: "L", availability: "out_of_stock" },
    ] });
    expect(result.evidence).toContainEqual({ field: "price", selector: ".legacy-price", raw: "$200" });
    expect(result.documentHash).toHaveLength(64);
  });
  it("rejects duplicate price elements, mismatched currency and missing variant values", () => {
    for (const page of [html + '<p class="legacy-price">$50</p>', html.replace("$200", "EUR 200"), html.replace('data-stock="yes"', 'data-stock="maybe"')]) {
      expect(extractRecipe(page, url, recipe).product).toBeNull();
    }
  });
  it("never treats the mere presence of size buttons as availability", () => {
    const loose = { ...recipe, variants: { selector: ".size", label: { selector: ":scope", attribute: "data-size" } } };
    expect(extractRecipe(html, url, loose).product?.variants.every((v) => v.availability === "unknown")).toBe(true);
  });
  it("rejects executable fields and wrong-origin extraction", () => {
    expect(recipeSchema.safeParse({ ...recipe, code: "process.env" }).success).toBe(false);
    expect(extractRecipe("<h1>Hi</h1>", "https://other.example/products/a", recipe).issues).toContain("scope: page does not match recipe");
  });
});
