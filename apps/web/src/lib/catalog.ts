import type { BrandVerdict } from "@closet/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

export function useForYou() {
  return useQuery({ queryKey: catalogKeys.forYou, queryFn: api.forYou });
}

/** Starting suggestions; kept for the visit so they don't reshuffle after every vote. */
export function useStarters() {
  return useQuery({ queryKey: catalogKeys.starters, queryFn: api.starters, staleTime: Infinity });
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
