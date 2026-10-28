import type { BrandVerdict } from "@skeleton/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "./api";

export const catalogKeys = {
  all: ["catalog"] as const,
  search: (q: string) => ["catalog", "search", q] as const,
  brand: (id: string) => ["catalog", "brand", id] as const,
  forYou: ["catalog", "for-you"] as const,
  starters: ["catalog", "starters"] as const,
};

/** Brands whose name contains the query, as you type. */
export function useBrandSearch(q: string) {
  const text = q.trim();
  return useQuery({
    queryKey: catalogKeys.search(text),
    queryFn: () => api.findBrands(text),
    enabled: text.length > 0,
    placeholderData: keepPreviousData,
  });
}

export function useBrand(id: string) {
  return useQuery({ queryKey: catalogKeys.brand(id), queryFn: () => api.brand(id) });
}

/** Set one brand's vote wherever it appears in cached catalog data (lists, a page, its neighbors). */
function withVote<T>(data: T, id: string, verdict: BrandVerdict | null): T {
  if (Array.isArray(data)) return data.map((x) => withVote(x, id, verdict)) as T;
  if (!data || typeof data !== "object") return data;
  const out: Record<string, unknown> = { ...(data as Record<string, unknown>) };
  if (out.id === id && "myVote" in out) out.myVote = verdict;
  for (const key of ["brands", "neighbors"]) if (Array.isArray(out[key])) out[key] = withVote(out[key], id, verdict);
  return out as T;
}

/**
 * Like, skip or flag a brand; voting the same way again clears it. The vote shows at once
 * everywhere; then everything but the starting suggestions refetches, since one vote changes
 * taste, counts and "For you" (the suggestions stay put so they don't reshuffle under you).
 */
export function useVote() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ id, verdict, context }: { id: string; verdict: BrandVerdict | null; context?: string }) =>
      api.voteBrand(id, { verdict, context }),
    onMutate: ({ id, verdict }) => {
      queryClient.setQueriesData({ queryKey: catalogKeys.all }, (data: unknown) => withVote(data, id, verdict));
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: catalogKeys.all, predicate: (q) => q.queryKey[1] !== "starters" }),
  });
  return {
    vote: (id: string, current: BrandVerdict | null, verdict: BrandVerdict, context?: string) =>
      mutation.mutate({ id, verdict: current === verdict ? null : verdict, context }),
  };
}

/**
 * Report how long a page (a brand, an item) was on screen when you leave it or close the tab:
 * Discover's quiet taste signal. `seen` is the endpoint to tell. Only visible time counts, and
 * glances under a second aren't sent at all.
 */
export function useDwell(seen: string | undefined) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!seen) return;
    let since: number | null = document.visibilityState === "visible" ? performance.now() : null;
    let total = 0;
    let sent = false;
    const pause = () => {
      if (since !== null) total += performance.now() - since;
      since = null;
    };
    const onVisibility = () => (document.visibilityState === "hidden" ? pause() : (since = performance.now()));
    const flush = () => {
      if (sent) return;
      pause();
      sent = true;
      if (total < 1000) return;
      void fetch(seen, {
        method: "POST",
        credentials: "same-origin",
        keepalive: true,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dwellMs: Math.round(total) }),
      }).then(() => queryClient.invalidateQueries({ queryKey: catalogKeys.forYou }), () => {});
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [seen, queryClient]);
}
