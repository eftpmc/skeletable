import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { isAccessoryFor, matchKey, normalizeGtin, parseCondition, relevance } from "../src/search/normalize.js";
import { MIN_RELEVANCE } from "../src/search/service.js";
import { parseShopifyStores } from "../src/search/sources/shopify.js";
import { queryCases } from "./search-queries.js";
import { iconLinks, toPng } from "../src/search/store-icons.js";
import { verdictFor } from "../src/search/verdict.js";

describe("normalize", () => {
  it.each([
    ["airpods pro 2", "Apple AirPods Pro 2 with MagSafe Charging Case", false],
    ["headphones", "Wireless Headphones for Travel", false],
    ["sony xm5", "Replacement Ear Pads for Sony WH-1000XM5", true],
    ["iphone 15", "Protective Cases for iPhone 15", true],
    ["iphone 15 case", "Protective Case for iPhone 15", false],
    ["sony xm5", "Sony WH-1000XM5 includes Carrying Case", false],
  ])("accessory filtering: %s → %s", (query, title, excluded) => {
    expect(isAccessoryFor(query, title)).toBe(excluded);
  });

  it("scores relevance by query words found", () => {
    expect(relevance("sony wireless headphones", "Sony WH-1000XM5 Headphones", null)).toBeCloseTo(2 / 3);
    expect(relevance("sony headphones", "Sony WH-1000XM5 Wireless Headphones", null)).toBe(1);
    expect(relevance("sony headphones", "Phone case", null)).toBe(0);
    expect(relevance("carhartt jacket", "Detroit Jacket", "Carhartt WIP")).toBe(1);
  });

  it.each(queryCases)("$query → $title: $match", ({ query, title, brand, match }) => {
    expect(relevance(query, title, brand ?? null) >= MIN_RELEVANCE).toBe(match);
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

describe("store icon helpers", () => {
  it("prefers apple-touch-icon, then the biggest declared icon", () => {
    const html = `<link rel="icon" href="/a.png" sizes="16x16"><link rel="shortcut icon" href="/b.ico">
      <link rel="icon" href="/c.png" sizes="96x96"><link rel="apple-touch-icon" href="https://cdn.shop.com/t.png">`;
    expect(iconLinks(html, "https://shop.com/")).toEqual([
      "https://cdn.shop.com/t.png",
      "https://shop.com/c.png",
      "https://shop.com/a.png",
      "https://shop.com/b.ico",
    ]);
  });

  it("reads the PNG inside a .ico and scales it to 64px", async () => {
    const png = await sharp({ create: { width: 48, height: 48, channels: 4, background: "#00f" } }).png().toBuffer();
    const header = Buffer.alloc(6 + 16);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(1, 4);
    header[6] = 48;
    header[7] = 48;
    header.writeUInt32LE(png.length, 6 + 8);
    header.writeUInt32LE(header.length, 6 + 12);
    const icon = await toPng(Buffer.concat([header, png]));
    expect(icon).not.toBeNull();
    const meta = await sharp(icon!).metadata();
    expect([meta.width, meta.height]).toEqual([64, 64]);
  });

  it("rejects things that aren't images", async () => {
    expect(await toPng(Buffer.from("<html></html>"))).toBeNull();
  });
});
