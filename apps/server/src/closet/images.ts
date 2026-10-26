import { type ColorName, palette } from "@closet/shared";
import sharp, { type Metadata, type Sharp } from "sharp";

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export type ProcessedImage = {
  full: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
  colors: ColorName[];
};

export class InvalidImageError extends Error {}

/** Normalize an uploaded image: fix rotation, cap size, convert to WebP, make a thumbnail. */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  let image: Sharp;
  let meta: Metadata;
  try {
    image = sharp(input, { limitInputPixels: 50_000_000 }).rotate();
    meta = await image.metadata();
  } catch {
    throw new InvalidImageError("Unsupported image");
  }
  if (!meta.width || !meta.height) throw new InvalidImageError("Unsupported image");

  const fullPipeline = image.clone().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true });
  const [full, thumb, colors] = await Promise.all([
    fullPipeline.clone().webp({ quality: 85 }).toBuffer({ resolveWithObject: true }),
    image.clone().resize({ width: 600, height: 600, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer(),
    extractColors(image.clone()),
  ]);

  return { full: full.data, thumb, width: full.info.width, height: full.info.height, colors };
}

type Rgb = [number, number, number];
type Lab = [number, number, number];

const SAMPLE = 48;

/**
 * Find the main named colors of the garment. Product photos usually sit on a plain
 * background, so we estimate the background from the image border and ignore it.
 */
export async function extractColors(image: Sharp, max = 3): Promise<ColorName[]> {
  const { data, info } = await image
    .resize(SAMPLE, SAMPLE, { fit: "fill" })
    .flatten({ background: "#ffffff" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels: Lab[] = [];
  const border: Lab[] = [];
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      const lab = rgbToLab([data[i]!, data[i + 1]!, data[i + 2]!]);
      pixels.push(lab);
      if (x === 0 || y === 0 || x === info.width - 1 || y === info.height - 1) border.push(lab);
    }
  }

  const background = median(border);
  const backgroundIsUniform = border.filter((lab) => distance(lab, background) < 12).length > border.length * 0.7;
  let subject = backgroundIsUniform ? pixels.filter((lab) => distance(lab, background) > 12) : pixels;
  if (subject.length < pixels.length * 0.05) subject = pixels;

  const counts = new Map<ColorName, number>();
  for (const lab of subject) {
    const name = nearestColor(lab);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .filter(([, count], index) => index === 0 || count / subject.length >= 0.15)
    .slice(0, max)
    .map(([name]) => name);
}

const paletteLab = (Object.entries(palette) as [ColorName, string][]).map(
  ([name, hex]) => [name, rgbToLab(hexToRgb(hex))] as const,
);

function nearestColor(lab: Lab): ColorName {
  let best = paletteLab[0]!;
  let bestDistance = Infinity;
  for (const entry of paletteLab) {
    const d = distance(lab, entry[1]);
    if (d < bestDistance) {
      best = entry;
      bestDistance = d;
    }
  }
  return best[0];
}

function median(labs: Lab[]): Lab {
  const pick = (axis: 0 | 1 | 2) => {
    const values = labs.map((lab) => lab[axis]).sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)] ?? 0;
  };
  return [pick(0), pick(1), pick(2)];
}

function distance(a: Lab, b: Lab) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function hexToRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function rgbToLab([r, g, b]: Rgb): Lab {
  const linear = (channel: number) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [lr, lg, lb] = [linear(r), linear(g), linear(b)];
  const x = (lr * 0.4124 + lg * 0.3576 + lb * 0.1805) / 0.95047;
  const y = lr * 0.2126 + lg * 0.7152 + lb * 0.0722;
  const z = (lr * 0.0193 + lg * 0.1192 + lb * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
