import { isAdmin } from "@closet/shared";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export const meKey = ["me"] as const;

/** The signed-in account with its role. Only call it when signed in. */
export function useMe() {
  return useQuery({ queryKey: meKey, queryFn: api.me, staleTime: 60 * 1000 });
}

/** Whether the signed-in account helps run this server (sees the admin sections). */
export function useIsAdmin() {
  return isAdmin(useMe().data?.role);
}
