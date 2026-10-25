import { z } from "zod";

export const categories = [
  "tops",
  "bottoms",
  "outerwear",
  "dresses",
  "shoes",
  "bags",
  "accessories",
  "other",
] as const;
export const categorySchema = z.enum(categories);
export type Category = z.infer<typeof categorySchema>;

export const categoryLabels: Record<Category, string> = {
  tops: "Tops",
  bottoms: "Bottoms",
  outerwear: "Outerwear",
  dresses: "Dresses",
  shoes: "Shoes",
  bags: "Bags",
  accessories: "Accessories",
  other: "Other",
};

/** Named colors used for tags and filters. Hex values are for swatches. */
export const palette = {
  black: "#141414",
  charcoal: "#3d3d3d",
  grey: "#9a9a9a",
  white: "#f7f7f5",
  cream: "#efe6d2",
  beige: "#d6c2a1",
  tan: "#b38a5c",
  brown: "#6b4528",
  navy: "#1f2a44",
  blue: "#3b6fb6",
  "light blue": "#a5c8e8",
  green: "#3f7d4e",
  olive: "#6d6b3b",
  red: "#b8312f",
  burgundy: "#6d1f2a",
  pink: "#e8a5b8",
  purple: "#6e4c9a",
  yellow: "#e8ca4f",
  orange: "#e07b2f",
} as const;
export type ColorName = keyof typeof palette;
export const colorNames = Object.keys(palette) as ColorName[];
export const colorSchema = z.enum(colorNames as [ColorName, ...ColorName[]]);

export const itemSources = ["link", "photo", "manual", "mcp"] as const;
export const itemSourceSchema = z.enum(itemSources);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .nullable()
    .optional();

export const itemInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  brand: optionalText(100),
  category: categorySchema,
  colors: z.array(colorSchema).max(5).default([]),
  size: optionalText(40),
  material: optionalText(100),
  notes: optionalText(2000),
  priceCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  currency: z
    .string()
    .length(3)
    .transform((value) => value.toUpperCase())
    .nullable()
    .optional(),
  purchasedOn: z.iso.date().nullable().optional(),
  sourceUrl: z.url().max(2000).nullable().optional(),
  source: itemSourceSchema.default("manual"),
  /** Uploaded media (from POST /api/media) to attach, in display order. */
  mediaIds: z.array(z.uuid()).max(10).default([]),
  /** Remote images to download and attach (e.g. from a link preview). */
  imageUrls: z.array(z.url()).max(10).default([]),
});
export type ItemInput = z.input<typeof itemInputSchema>;
export type ParsedItemInput = z.output<typeof itemInputSchema>;

export const itemPatchSchema = itemInputSchema
  .omit({ source: true, imageUrls: true })
  .partial()
  .extend({ mediaIds: z.array(z.uuid()).max(10).optional() });
export type ItemPatch = z.input<typeof itemPatchSchema>;

export type MediaRef = {
  id: string;
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
};

export type Item = {
  id: string;
  title: string;
  brand: string | null;
  category: Category;
  colors: ColorName[];
  size: string | null;
  material: string | null;
  notes: string | null;
  priceCents: number | null;
  currency: string | null;
  purchasedOn: string | null;
  sourceUrl: string | null;
  source: (typeof itemSources)[number];
  media: MediaRef[];
  wear: {
    count: number;
    lastWornOn: string | null;
    costPerWearCents: number | null;
  };
  createdAt: string;
  updatedAt: string;
};

export type LinkPreview = {
  url: string;
  title: string | null;
  brand: string | null;
  priceCents: number | null;
  currency: string | null;
  images: string[];
  category: Category | null;
  colors: ColorName[];
  siteName: string | null;
};

export const brandFitInputSchema = z.object({
  brand: z.string().trim().min(1).max(100),
  size: optionalText(40),
  note: optionalText(300),
});
export type BrandFitInput = z.input<typeof brandFitInputSchema>;

export type BrandFit = {
  brand: string;
  size: string | null;
  note: string | null;
};
