import type { Preferences, PreferencesInput } from "@skeleton/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export const preferencesKey = ["preferences"] as const;

/** What someone wants Discover to show them. */
export function usePreferences() {
  return useQuery({ queryKey: preferencesKey, queryFn: api.preferences, staleTime: 5 * 60 * 1000 });
}

/**
 * Change preferences. The change shows at once; the feed and its categories are fetched again,
 * since what's in them depends on it.
 */
export function useSetPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PreferencesInput) => api.setPreferences(input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: preferencesKey });
      const before = queryClient.getQueryData<Preferences>(preferencesKey);
      if (before) queryClient.setQueryData<Preferences>(preferencesKey, { ...before, ...input } as Preferences);
      return { before };
    },
    onError: (_error, _input, context) => {
      if (context?.before) queryClient.setQueryData(preferencesKey, context.before);
    },
    onSuccess: (prefs) => {
      queryClient.setQueryData(preferencesKey, prefs);
      void queryClient.invalidateQueries({ queryKey: ["catalog"] });
    },
  });
}
