import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { InvalidImageError, processImage } from "../src/closet/images.js";

/** A product-style photo: a colored garment shape on a plain background. */
async function productPhoto(garment: string, background = "#ffffff", accent?: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000">
    <rect width="800" height="1000" fill="${background}"/>
    <rect x="150" y="150" width="500" height="700" rx="40" fill="${garment}"/>
    ${accent ? `<rect x="150" y="600" width="500" height="250" fill="${accent}"/>` : ""}
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg().toBuffer();
}

describe("processImage", () => {
  it("ignores a white background and finds the garment color", async () => {
    const result = await processImage(await productPhoto("#1e2a46"));
    expect(result.colors[0]).toBe("navy");
    expect(result.colors).not.toContain("white");
  });

  it("works on a grey studio background", async () => {
    const result = await processImage(await productPhoto("#6c4426", "#e6e6e6"));
    expect(result.colors[0]).toBe("brown");
  });

  it("reports a second color when it covers enough of the garment", async () => {
    const result = await processImage(await productPhoto("#b8312f", "#ffffff", "#141414"));
    expect(result.colors).toEqual(expect.arrayContaining(["red", "black"]));
  });

  it("finds white garments on a dark background", async () => {
    const result = await processImage(await productPhoto("#f7f7f5", "#141414"));
    expect(result.colors[0]).toBe("white");
  });

  it("resizes large images and makes a smaller thumbnail", async () => {
    const big = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: "#3f7d4e" } })
      .png()
      .toBuffer();
    const result = await processImage(big);
    expect(Math.max(result.width, result.height)).toBe(1600);
    const thumb = await sharp(result.thumb).metadata();
    expect(Math.max(thumb.width!, thumb.height!)).toBe(600);
    expect(thumb.format).toBe("webp");
  });

  it("rejects files that are not images", async () => {
    await expect(processImage(Buffer.from("not an image"))).rejects.toBeInstanceOf(InvalidImageError);
  });
});
