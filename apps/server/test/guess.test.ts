import { describe, expect, it } from "vitest";
import { guessCategory, parseColorNames } from "../src/closet/guess.js";

describe("guessCategory", () => {
  it.each([
    ["Detroit Jacket", "outerwear"],
    ["Sherpa Lined Denim Jacket", "outerwear"],
    ["Heavyweight Pocket T-Shirt", "tops"],
    ["Relaxed Straight Jeans", "bottoms"],
    ["Air Force 1 '07 Sneakers", "shoes"],
    ["Sneaker Socks 3-Pack", "accessories"],
    ["Shirt Jacket", "outerwear"],
    ["Waxed Canvas Tote Bag", "bags"],
    ["Linen Midi Dress", "dresses"],
    ["Something Unrelated", null],
  ])("%s → %s", (title, expected) => {
    expect(guessCategory(title)).toBe(expected);
  });

  it("uses the store's category text too", () => {
    expect(guessCategory("Apparel > Pants", "The Daily Standard")).toBe("bottoms");
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
