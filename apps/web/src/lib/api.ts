import {
  type AdminOverview,
  type AdminStores,
  type AdminUser,
  type AlertsResponse,
  type BestBuyKeyInput,
  type BrandCard,
  type BrandDetail,
  type BrandFit,
  type BrandFitInput,
  type Category,
  type CategoryCount,
  type CategoryId,
  type ColorName,
  type ForYou,
  type ItemDetail,
  type ItemFeed,
  type Item,
  type ItemInput,
  type ItemPatch,
  type LinkPreview,
  type Me,
  type MediaRef,
  type NotifySettings,
  type NotifySettingsInput,
  type Preferences,
  type PreferencesInput,
  type ProductDetail,
  type Role,
  type SavedSearchInput,
  type SavedSearchSummary,
  type SearchResponse,
  type Condition,
  type SourceInfo,
  type ServerInfo,
  type ShopifyStoreInput,
  type EbayKeysInput,
  type VoteInput,
  type WatchInput,
  type WatchSummary,
  serverInfoSchema,
} from "@closet/shared";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body !== undefined && !isForm ? { "content-type": "application/json" } : undefined,
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(response.status, data.error ?? "error", data.message ?? "Something went wrong. Try again.");
  }
  return data as T;
}

export async function getServerInfo(): Promise<ServerInfo> {
  return serverInfoSchema.parse(await request("GET", "/api/info"));
}

export type ItemFilters = { category?: Category; color?: ColorName; q?: string };

export type SearchParams = { q: string; condition?: Condition; max?: number };

export const api = {
  search: ({ q, condition, max }: SearchParams) => {
    const params = new URLSearchParams({ q });
    if (condition) params.set("condition", condition);
    if (max) params.set("max", String(max));
    return request<SearchResponse>("GET", `/api/search?${params}`);
  },
  resolveLink: (url: string) => request<{ productId: string }>("POST", "/api/search/link", { url }),
  product: (id: string) => request<ProductDetail>("GET", `/api/products/${id}`),
  sources: () => request<SourceInfo[]>("GET", "/api/sources"),
  me: () => request<Me>("GET", "/api/me"),
  admin: {
    overview: () => request<AdminOverview>("GET", "/api/admin/overview"),
    stores: () => request<AdminStores>("GET", "/api/admin/stores"),
    addShopify: (input: ShopifyStoreInput) => request<AdminStores>("POST", "/api/admin/stores/shopify", input),
    removeShopify: (domain: string) => request<AdminStores>("DELETE", `/api/admin/stores/shopify/${encodeURIComponent(domain)}`),
    setEbay: (input: EbayKeysInput) => request<AdminStores>("PUT", "/api/admin/stores/ebay", input),
    clearEbay: () => request<AdminStores>("DELETE", "/api/admin/stores/ebay"),
    setBestBuy: (input: BestBuyKeyInput) => request<AdminStores>("PUT", "/api/admin/stores/bestbuy", input),
    clearBestBuy: () => request<AdminStores>("DELETE", "/api/admin/stores/bestbuy"),
    users: () => request<AdminUser[]>("GET", "/api/admin/users"),
    setRole: (id: string, role: Exclude<Role, "owner">) => request<{ ok: true }>("PATCH", `/api/admin/users/${id}`, { role }),
  },
  watches: () => request<WatchSummary[]>("GET", "/api/watches"),
  watch: (input: WatchInput) => request<WatchSummary>("POST", "/api/watches", input),
  unwatch: (productId: string) => request<void>("DELETE", `/api/watches/${productId}`),
  savedSearches: () => request<SavedSearchSummary[]>("GET", "/api/saved-searches"),
  saveSearch: (input: SavedSearchInput) => request<SavedSearchSummary>("POST", "/api/saved-searches", input),
  deleteSearch: (id: string) => request<void>("DELETE", `/api/saved-searches/${id}`),
  searchViewed: (id: string) => request<void>("POST", `/api/saved-searches/${id}/viewed`),
  alerts: () => request<AlertsResponse>("GET", "/api/alerts"),
  unreadAlerts: () => request<{ unread: number }>("GET", "/api/alerts/unread"),
  readAlerts: () => request<void>("POST", "/api/alerts/read"),
  notifications: () => request<NotifySettings>("GET", "/api/notifications"),
  saveNotifications: (input: NotifySettingsInput) => request<NotifySettings>("PUT", "/api/notifications", input),
  testNotification: (channel: "ntfy" | "email") => request<void>("POST", "/api/notifications/test", { channel }),
  items: (filters: ItemFilters = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    const query = params.toString();
    return request<Item[]>("GET", `/api/items${query ? `?${query}` : ""}`);
  },
  item: (id: string) => request<Item>("GET", `/api/items/${id}`),
  createItem: (input: ItemInput) => request<Item>("POST", "/api/items", input),
  updateItem: (id: string, patch: ItemPatch) => request<Item>("PATCH", `/api/items/${id}`, patch),
  deleteItem: (id: string) => request<void>("DELETE", `/api/items/${id}`),
  logWear: (id: string, date: string) => request<Item>("POST", `/api/items/${id}/wears`, { date }),
  unlogWear: (id: string, date: string) => request<Item>("DELETE", `/api/items/${id}/wears/${date}`),
  wears: (id: string) => request<string[]>("GET", `/api/items/${id}/wears`),
  preview: (url: string) => request<LinkPreview>("POST", "/api/import/preview", { url }),
  upload: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<MediaRef & { colors: ColorName[] }>("POST", "/api/media", form);
  },
  findBrands: (q: string) => request<BrandCard[]>("GET", `/api/catalog/brands?${new URLSearchParams({ q })}`),
  brand: (id: string) => request<BrandDetail>("GET", `/api/catalog/brands/${id}`),
  voteBrand: (id: string, vote: VoteInput) => request<void>("PUT", `/api/catalog/brands/${id}/vote`, vote),
  forYou: () => request<ForYou>("GET", "/api/catalog/for-you"),
  starters: () => request<BrandCard[]>("GET", "/api/catalog/starters"),
  feed: (page: number, seed: string, category?: CategoryId) =>
    request<ItemFeed>("GET", `/api/catalog/feed?${new URLSearchParams({ page: String(page), seed, ...(category ? { category } : {}) })}`),
  catalogCategories: () => request<CategoryCount[]>("GET", "/api/catalog/categories"),
  preferences: () => request<Preferences>("GET", "/api/preferences"),
  setPreferences: (input: PreferencesInput) => request<Preferences>("PATCH", "/api/preferences", input),
  catalogItem: (id: string) => request<ItemDetail>("GET", `/api/catalog/items/${encodeURIComponent(id)}`),
  saveItem: (id: string) => request<{ productId: string }>("POST", `/api/catalog/items/${encodeURIComponent(id)}/save`),
  brands: () => request<string[]>("GET", "/api/brands"),
  brandFits: () => request<BrandFit[]>("GET", "/api/brand-fits"),
  saveBrandFit: (fit: BrandFitInput) => request<BrandFit[]>("PUT", "/api/brand-fits", fit),
  deleteBrandFit: (brand: string) => request<BrandFit[]>("DELETE", `/api/brand-fits/${encodeURIComponent(brand)}`),
};
