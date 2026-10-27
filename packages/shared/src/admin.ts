import { z } from "zod";

/** "owner" runs the server (the first account), "admin" helps run it, "member" just uses it. */
export const roleSchema = z.enum(["owner", "admin", "member"]);
export type Role = z.infer<typeof roleSchema>;

export const isAdmin = (role: Role | string | null | undefined) => role === "owner" || role === "admin";

/** Who's signed in, with what they may do. */
export type Me = { id: string; name: string; email: string; image: string | null; role: Role };

/** Where a store setting comes from: the server's environment (read-only here) or the admin page. */
export type SettingOrigin = "env" | "admin";

export type AdminShopifyStore = { domain: string; name: string; condition: "new" | "used"; currency: string; origin: SettingOrigin };

/** A keyed source: whether it's set up and where from. Secrets never come back, only their last characters. */
export type AdminKeyedSource = { configured: boolean; origin: SettingOrigin | null; hint: string | null };

export type AdminStores = {
  shopify: AdminShopifyStore[];
  ebay: AdminKeyedSource & { marketplace: string };
  bestbuy: AdminKeyedSource;
};

export const shopifyStoreInputSchema = z.object({
  domain: z
    .string()
    .trim()
    .min(3)
    .max(253)
    .transform((value) => value.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase()),
  name: z.string().trim().max(80).optional(),
  condition: z.enum(["new", "used"]).default("new"),
  currency: z.string().regex(/^[A-Z]{3}$/).default("USD"),
});
export type ShopifyStoreInput = z.input<typeof shopifyStoreInputSchema>;

export const ebayKeysInputSchema = z.object({
  clientId: z.string().trim().min(8).max(200),
  clientSecret: z.string().trim().min(8).max(200),
  marketplace: z.string().trim().regex(/^EBAY_[A-Z]{2,4}$/).default("EBAY_US"),
});
export type EbayKeysInput = z.input<typeof ebayKeysInputSchema>;

export const bestBuyKeyInputSchema = z.object({ apiKey: z.string().trim().min(8).max(200) });
export type BestBuyKeyInput = z.input<typeof bestBuyKeyInputSchema>;

export type AdminUser = { id: string; name: string; email: string; role: Role; createdAt: string };

export const roleInputSchema = z.object({ role: z.enum(["admin", "member"]) });

/** The server at a glance, for the admin overview. */
export type AdminOverview = {
  version: string;
  deployment: "cloud" | "selfhost";
  signupsEnabled: boolean;
  publicSearch: boolean;
  email: boolean;
  counts: { users: number; products: number; offers: number; savedSearches: number; watches: number };
};
