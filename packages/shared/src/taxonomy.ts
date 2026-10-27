import { z } from "zod";

/**
 * How the catalog is organized: every product has one department and one category. The catalog
 * pack is sorted by lab/brands/taxonomy.py, which uses the same ids.
 */
export const departments = ["women", "men", "unisex"] as const;
export type Department = (typeof departments)[number];

/** What a brand mostly makes: one side (80% or more of its products) or both. */
export type BrandDepartment = "women" | "men" | "both";

export const categoryGroups = [
  { id: "clothing", label: "Clothing" },
  { id: "shoes", label: "Shoes" },
  { id: "bags", label: "Bags" },
  { id: "accessories", label: "Accessories" },
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
] as const;

export type CategoryId = (typeof catalogCategories)[number]["id"];
export const categoryIds = catalogCategories.map((c) => c.id) as [CategoryId, ...CategoryId[]];
export const catalogCategorySchema = z.enum(categoryIds);

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
