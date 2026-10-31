import { expect, it } from "vitest";
import { cellId, place, splitQuote } from "../src/lib/cells";

it("tells pages on one site apart", () => {
  expect(place("https://www.steamdeck.com/en/tech/")).toBe("steamdeck.com/en/tech");
  expect(place("https://www.steamdeck.com/")).toBe("steamdeck.com");
});

it("gives a cell an address from its row and column", () => {
  expect(cellId("Kindle (2026)", "weight_g")).toBe("kindle-2026--weight_g");
});

it("finds a whole number, not part of a bigger one", () => {
  expect(splitQuote(6, "16 GB or 6 GB")).toEqual(["16 GB or ", "6", " GB"]);
  expect(splitQuote(6, "$6.00 a month")).toEqual(["$", "6.00", " a month"]);
});

it("finds text whatever its case", () => {
  expect(splitQuote("IPX8", "waterproof (ipx8) dark mode")).toEqual(["waterproof (", "ipx8", ") dark mode"]);
});

it("leaves a quote whole when the value isn't in it", () => {
  expect(splitQuote("60 MWh total", "60 MWh")).toEqual(["60 MWh"]);
});
