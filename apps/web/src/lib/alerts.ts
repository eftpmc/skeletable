import type { Condition, SavedSearchSummary } from "@closet/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export const alertKeys = {
  watches: ["watches"] as const,
  searches: ["saved-searches"] as const,
  feed: ["alerts"] as const,
  unread: ["alerts", "unread"] as const,
};

/** Unread alerts for the sidebar. Checked every few minutes; the scheduler runs far less often. */
export function useUnreadAlerts() {
  return useQuery({ queryKey: alertKeys.unread, queryFn: api.unreadAlerts, refetchInterval: 5 * 60 * 1000, select: (r) => r.unread });
}

export function useWatches() {
  return useQuery({ queryKey: alertKeys.watches, queryFn: api.watches });
}

/** Track or stop tracking a product. */
export function useToggleWatch(productId: string) {
  const queryClient = useQueryClient();
  const { data: watches = [] } = useWatches();
  const watching = watches.some((w) => w.productId === productId);
  const mutation = useMutation({
    mutationFn: async (condition: Condition | undefined) => {
      if (watching) await api.unwatch(productId);
      else await api.watch({ productId, condition });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: alertKeys.watches }),
  });
  return { watching, toggle: (condition?: Condition) => mutation.mutate(condition), pending: mutation.isPending };
}

export function useSavedSearches() {
  return useQuery({ queryKey: alertKeys.searches, queryFn: api.savedSearches });
}

const sameSearch = (s: SavedSearchSummary, q: string, condition?: Condition, max?: number) =>
  s.query.toLowerCase() === q.toLowerCase() && s.condition === (condition ?? null) && s.max === (max ?? null);

/** Save or unsave the search on screen. Opening a saved search's results clears its "N new". */
export function useSavedSearch(q: string, condition?: Condition, max?: number) {
  const queryClient = useQueryClient();
  const { data: searches = [] } = useSavedSearches();
  const saved = searches.find((s) => sameSearch(s, q, condition, max)) ?? null;
  const invalidate = () => Promise.all([queryClient.invalidateQueries({ queryKey: alertKeys.searches }), queryClient.invalidateQueries({ queryKey: alertKeys.feed })]);
  const mutation = useMutation({
    mutationFn: () => (saved ? api.deleteSearch(saved.id) : api.saveSearch({ q, condition, max }).then(() => undefined)),
    onSettled: invalidate,
  });
  const viewed = useMutation({ mutationFn: (id: string) => api.searchViewed(id), onSettled: invalidate });
  return { saved, toggle: () => mutation.mutate(), pending: mutation.isPending, markViewed: viewed.mutate };
}

/** Link to a saved search's results. */
export function searchHref(s: { query: string; condition: Condition | null; max: number | null }) {
  const params = new URLSearchParams({ q: s.query });
  if (s.condition) params.set("condition", s.condition);
  if (s.max) params.set("max", String(s.max));
  return `/search?${params}`;
}

/** "under $250 · used" */
export function searchDetail(s: { condition: Condition | null; max: number | null }) {
  return [s.max ? `under $${s.max}` : null, s.condition ? { new: "new", refurb: "refurb", used: "used" }[s.condition] : null].filter(Boolean).join(" · ");
}
