import { z } from "zod";

/**
 * How the catalog is organized: area → group → category. Every product sits in one category (and so
 * one group and one area); clothing also has a department. Areas open as stores for them are added;
 * a category with nothing in it yet is simply empty. Clothing's ids match lab/brands/taxonomy.py.
 */
export const departments = ["women", "men", "unisex"] as const;
export type Department = (typeof departments)[number];

/** What a brand mostly makes: one side (80% or more of its products) or both. */
export type BrandDepartment = "women" | "men" | "both";

export const areas = [
  { id: "clothing", label: "Clothing" },
  { id: "home", label: "Home" },
  { id: "tech", label: "Tech" },
] as const;
export type AreaId = (typeof areas)[number]["id"];
export const areaIds = areas.map((a) => a.id) as [AreaId, ...AreaId[]];
export const areaSchema = z.enum(areaIds);

export const categoryGroups = [
  { id: "clothing", label: "Clothing", area: "clothing" },
  { id: "shoes", label: "Shoes", area: "clothing" },
  { id: "bags", label: "Bags", area: "clothing" },
  { id: "accessories", label: "Accessories", area: "clothing" },
  { id: "kitchen", label: "Kitchen & dining", area: "home" },
  { id: "decor", label: "Decor & lighting", area: "home" },
  { id: "textiles", label: "Bed & bath", area: "home" },
  { id: "furniture", label: "Furniture", area: "home" },
  { id: "audio", label: "Audio", area: "tech" },
  { id: "desk", label: "Desk & computing", area: "tech" },
  { id: "photo", label: "Photo & video", area: "tech" },
] as const;

/** Every category in display order, with the group it sits in. */
export const catalogCategories = [
  { id: "tops", label: "Tops & tees", group: "clothing" },
  { id: "shirts", label: "Shirts", group: "clothing" },
  { id: "knitwear", label: "Knitwear", group: "clothing" },
  { id: "sweats", label: "Sweats & hoodies", group: "clothing" },
  { id: "outerwear", label: "Coats & jackets", group: "clothing" },
  { id: "tailoring", label: "Tailoring", group: "clothing" },
  { id: "dresses", label: "Dresses & jumpsuits", group: "clothing" },
  { id: "skirts", label: "Skirts", group: "clothing" },
  { id: "trousers", label: "Trousers", group: "clothing" },
  { id: "jeans", label: "Jeans", group: "clothing" },
  { id: "shorts", label: "Shorts", group: "clothing" },
  { id: "activewear", label: "Activewear", group: "clothing" },
  { id: "swimwear", label: "Swimwear", group: "clothing" },
  { id: "intimates", label: "Underwear & sleep", group: "clothing" },
  { id: "shoes", label: "Shoes", group: "shoes" },
  { id: "bags", label: "Bags", group: "bags" },
  { id: "accessories", label: "Accessories", group: "accessories" },
  { id: "jewelry", label: "Jewelry", group: "accessories" },
  { id: "cookware", label: "Cookware", group: "kitchen" },
  { id: "knives", label: "Kitchen knives", group: "kitchen" },
  { id: "tableware", label: "Plates, bowls & mugs", group: "kitchen" },
  { id: "glassware", label: "Glassware", group: "kitchen" },
  { id: "lighting", label: "Lighting", group: "decor" },
  { id: "objects", label: "Vases & objects", group: "decor" },
  { id: "art", label: "Art & prints", group: "decor" },
  { id: "scent", label: "Candles & scent", group: "decor" },
  { id: "bedding", label: "Bedding", group: "textiles" },
  { id: "bath", label: "Towels & bath", group: "textiles" },
  { id: "throws", label: "Throws & cushions", group: "textiles" },
  { id: "rugs", label: "Rugs", group: "textiles" },
  { id: "seating", label: "Chairs & seating", group: "furniture" },
  { id: "tables", label: "Tables & desks", group: "furniture" },
  { id: "storage", label: "Shelves & storage", group: "furniture" },
  { id: "headphones", label: "Headphones", group: "audio" },
  { id: "speakers", label: "Speakers & hi-fi", group: "audio" },
  { id: "keyboards", label: "Keyboards", group: "desk" },
  { id: "desk-gear", label: "Desk gear", group: "desk" },
  { id: "cameras", label: "Cameras", group: "photo" },
  { id: "lenses", label: "Lenses", group: "photo" },
] as const;

export type CategoryId = (typeof catalogCategories)[number]["id"];
export const categoryIds = catalogCategories.map((c) => c.id) as [CategoryId, ...CategoryId[]];
export const catalogCategorySchema = z.enum(categoryIds);

export type CategoryGroupId = (typeof categoryGroups)[number]["id"];
export const categoryGroupSchema = z.enum(categoryGroups.map((g) => g.id) as [CategoryGroupId, ...CategoryGroupId[]]);
/** The categories in one group, in display order. */
export const categoriesIn = (group: CategoryGroupId): CategoryId[] => catalogCategories.filter((c) => c.group === group).map((c) => c.id);

/** The area a category belongs to, through its group. */
export const areaOf = (category: CategoryId): AreaId => categoryGroups.find((g) => g.id === catalogCategories.find((c) => c.id === category)!.group)!.area;

/** The categories in one area, in display order. */
export const categoriesInArea = (area: AreaId): CategoryId[] =>
  catalogCategories.filter((c) => categoryGroups.find((g) => g.id === c.group)!.area === area).map((c) => c.id);

const labels = new Map<string, string>(catalogCategories.map((c) => [c.id, c.label]));
export const categoryLabel = (id: string) => labels.get(id) ?? id;

export const departmentLabel: Record<Department | BrandDepartment, string> = {
  women: "Womenswear",
  men: "Menswear",
  unisex: "Unisex",
  both: "Women & men",
};

/** Which part of the catalog someone browses. "all" shows everything; unisex shows to everyone. */
export const shopForSchema = z.enum(["women", "men", "all"]);
export type ShopFor = z.infer<typeof shopForSchema>;

/** Departments a shopper sees. */
export function departmentsFor(shopFor: ShopFor | null): Department[] {
  if (shopFor === "women") return ["women", "unisex"];
  if (shopFor === "men") return ["men", "unisex"];
  return [...departments];
}

/** What someone wants to see. shopFor is null until they've answered. */
export type Preferences = { shopFor: ShopFor | null; priceMaxUsd: number | null; hiddenCategories: CategoryId[] };

export const preferencesInputSchema = z
  .object({
    shopFor: shopForSchema.nullable(),
    priceMaxUsd: z.number().int().min(10).max(100_000).nullable(),
    hiddenCategories: z.array(catalogCategorySchema).max(catalogCategories.length),
  })
  .partial();
export type PreferencesInput = z.input<typeof preferencesInputSchema>;
