import { describe, expect, it } from "vitest";
import { category, departmentWords, isKids, tagList, womenByGarment } from "../src/annotate/taxonomy.js";

// Expected values were checked against lab/brands/taxonomy.py.
describe("category", () => {
  it("reads the garment named last in the title", () => {
    expect(category("Shirt Dress")).toEqual({ category: "dresses", how: "title" });
    expect(category("Denim Jacket")).toEqual({ category: "outerwear", how: "title" });
    expect(category("Swim Shorts")).toEqual({ category: "swimwear", how: "title" });
  });

  it("prefers the longest alternative when two end in the same place", () => {
    expect(category("Sweater Vest")).toEqual({ category: "knitwear", how: "title" });
  });

  it("reads the product type first when it names a garment", () => {
    expect(category("Sofia Dress", "T-Shirts")).toEqual({ category: "tops", how: "type" });
  });

  it("skips the product type when it names no garment", () => {
    expect(category("Sofia Dress", "FW26")).toEqual({ category: "dresses", how: "title" });
  });

  it("strips the colour suffix before reading the title", () => {
    expect(category("Sofia Dress - Oat Leopard")).toEqual({ category: "dresses", how: "title" });
  });

  it("returns other for non-clothing", () => {
    expect(category("Gift Card")).toEqual({ category: "other", how: "title" });
  });

  it("uses tags only when they name exactly one category", () => {
    expect(category("Essential Piece", "", ["jeans", "new arrival"])).toEqual({ category: "jeans", how: "tags" });
    expect(category("Essential Piece", "", "jeans, new arrival")).toEqual({ category: "jeans", how: "tags" });
    expect(category("Essential Piece", "", ["tees", "jackets"])).toEqual({ category: null, how: null });
  });
});

describe("tagList", () => {
  it("splits a comma string and drops empty or long tags", () => {
    expect(tagList("a, b ,,")).toEqual(["a", "b"]);
    expect(tagList(["x".repeat(40), "ok"])).toEqual(["ok"]);
    expect(tagList(null)).toEqual([]);
  });
});

describe("isKids", () => {
  it("detects kids words in the title, type or tags", () => {
    expect(isKids("Kids Hoodie")).toBe(true);
    expect(isKids("Baby Romper")).toBe(true);
    expect(isKids("Essential Tee", "", ["Kids"])).toBe(true);
  });

  it("does not read boyfriend as boy", () => {
    expect(isKids("Boyfriend Jeans")).toBe(false);
  });
});

describe("departmentWords", () => {
  it("reads women, men and unisex words", () => {
    expect(departmentWords("Women's Jacket")).toBe("women");
    expect(departmentWords("Men's Shirt")).toBe("men");
    expect(departmentWords("Unisex Tee")).toBe("unisex");
  });

  it("calls a product with both women and men words unisex", () => {
    expect(departmentWords("Women's and Men's Tee")).toBe("unisex");
  });

  it("finds department words in tags", () => {
    expect(departmentWords("Tee", "", ["mens"])).toBe("men");
    expect(departmentWords("Tee")).toBeNull();
  });
});

describe("womenByGarment", () => {
  it("counts dresses as women's", () => {
    expect(womenByGarment("dresses", "Anything")).toBe(true);
  });

  it("counts a women-only word in the title as women's", () => {
    expect(womenByGarment(null, "Lace Bralette")).toBe(true);
    expect(womenByGarment("shirts", "Oxford Shirt")).toBe(false);
  });
});
