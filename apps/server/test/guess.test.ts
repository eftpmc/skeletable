import { describe, expect, it } from "vitest";
import { guessCategory, parseColorNames } from "../src/closet/guess.js";

describe("guessCategory", () => {
  it.each([
    ["Detroit Jacket", "clothing"],
    ["Heavyweight Pocket T-Shirt", "clothing"],
    ["Air Force 1 '07 Sneakers", "shoes"],
    ["Sneaker Socks 3-Pack", "accessories"],
    ["Waxed Canvas Tote Bag", "accessories"],
    ["Sony WH-1000XM5 Wireless Headphones", "tech"],
    ["PS5 DualSense Controller", "gaming"],
    ["Velvet Two-Seater Sofa", "home"],
    ["2-Person Backpacking Tent", "outdoors"],
    ["Something Unrelated", null],
  ])("%s → %s", (title, expected) => {
    expect(guessCategory(title)).toBe(expected);
  });

  it("uses the store's category text too", () => {
    expect(guessCategory("Apparel > Pants", "The Daily Standard")).toBe("clothing");
  });
});

describe("parseColorNames", () => {
  it.each([
    ["Midnight Navy", ["navy"]],
    ["Off-White", ["cream"]],
    ["Light Blue", ["light blue"]],
    ["Black / White", ["black", "white"]],
    ["Hamilton Brown", ["brown"]],
    ["Heather Grey", ["grey"]],
    ["Sour Apple", []],
  ])("%s → %j", (input, expected) => {
    expect(parseColorNames(input)).toEqual(expected);
  });
});
