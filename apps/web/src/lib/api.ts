import {
  type BrandFit,
  type BrandFitInput,
  type Category,
  type ColorName,
  type Item,
  type ItemInput,
  type ItemPatch,
  type LinkPreview,
  type MediaRef,
  type ServerInfo,
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

export const api = {
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
  brands: () => request<string[]>("GET", "/api/brands"),
  brandFits: () => request<BrandFit[]>("GET", "/api/brand-fits"),
  saveBrandFit: (fit: BrandFitInput) => request<BrandFit[]>("PUT", "/api/brand-fits", fit),
  deleteBrandFit: (brand: string) => request<BrandFit[]>("DELETE", `/api/brand-fits/${encodeURIComponent(brand)}`),
};
