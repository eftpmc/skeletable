import { budgetLabel, intentKey, type Condition, type SavedSearchSummary, type SearchIntent } from "@closet/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { useSignUpPrompt, useSignedIn } from "./viewer";

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
  return useQuery({ queryKey: alertKeys.watches, queryFn: api.watches, enabled: useSignedIn() });
}

/** Track or stop tracking a product. Signed out, it asks you to create an account first. */
export function useToggleWatch(productId: string) {
  const queryClient = useQueryClient();
  const signedIn = useSignedIn();
  const signUp = useSignUpPrompt();
  const { data: watches = [] } = useWatches();
  const watching = watches.some((w) => w.productId === productId);
  const mutation = useMutation({
    mutationFn: async (condition: Condition | undefined) => {
      if (watching) await api.unwatch(productId);
      else await api.watch({ productId, condition });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: alertKeys.watches }),
  });
  const toggle = (condition?: Condition) => (signedIn ? mutation.mutate(condition) : signUp());
  return { watching, toggle, pending: mutation.isPending };
}

export function useSavedSearches() {
  return useQuery({ queryKey: alertKeys.searches, queryFn: api.savedSearches, enabled: useSignedIn() });
}

const sameSearch = (s: SavedSearchSummary, q: string, condition?: Condition, max?: number, intent?: SearchIntent) =>
  s.intent && intent ? intentKey(s.intent) === intentKey(intent) : s.query.toLowerCase() === q.toLowerCase() && s.condition === (condition ?? null) && s.max === (max ?? null);

/**
 * Save or unsave the search on screen. Opening a saved search's results clears its "N new".
 * Signed out, saving asks you to create an account first.
 */
export function useSavedSearch(q: string, condition?: Condition, max?: number, intent?: SearchIntent) {
  const queryClient = useQueryClient();
  const signedIn = useSignedIn();
  const signUp = useSignUpPrompt();
  const { data: searches = [] } = useSavedSearches();
  const saved = searches.find((s) => sameSearch(s, q, condition, max, intent)) ?? null;
  const invalidate = () => Promise.all([queryClient.invalidateQueries({ queryKey: alertKeys.searches }), queryClient.invalidateQueries({ queryKey: alertKeys.feed })]);
  const mutation = useMutation({
    mutationFn: () => (saved ? api.deleteSearch(saved.id) : api.saveSearch({ q, condition, max, intent }).then(() => undefined)),
    onSettled: invalidate,
  });
  const viewed = useMutation({ mutationFn: (id: string) => api.searchViewed(id), onSettled: invalidate });
  const toggle = () => (signedIn ? mutation.mutate() : signUp());
  return { saved, toggle, pending: mutation.isPending, markViewed: viewed.mutate };
}

/** Link to a saved search's results. */
export function searchHref(s: { query: string; condition: Condition | null; max: number | null; intent?: SearchIntent | null }) {
  const params = new URLSearchParams({ q: s.query });
  if (s.condition) params.set("condition", s.condition);
  if (s.max) params.set("max", String(s.max));
  if (s.intent) params.set("intent", JSON.stringify(s.intent));
  return `/search?${params}`;
}

/** "under $250 · used" */
export function searchDetail(s: { condition: Condition | null; max: number | null; intent?: SearchIntent | null }) {
  if (s.intent) return [
    s.intent.condition && `${s.intent.condition.strength === "preferred" ? "Prefer " : ""}${s.intent.condition.values.join(" or ")}`,
    s.intent.budget && `${s.intent.budget.strength === "preferred" ? "Prefer " : ""}${budgetLabel(s.intent.budget)}`,
    ...s.intent.attributes.map((a) => `${a.text} (unverified)`),
  ].filter(Boolean).join(" · ");
  return [s.max ? `under $${s.max}` : null, s.condition ? { new: "new", refurb: "refurb", used: "used" }[s.condition] : null].filter(Boolean).join(" · ");
}
