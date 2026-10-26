import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router";
import { getServerInfo } from "./api";
import { useSession } from "./auth-client";

export function useServerInfo() {
  return useQuery({ queryKey: ["server-info"], queryFn: getServerInfo, staleTime: 60 * 1000 });
}

/** Signed-out visitors can search on servers with public search; everything personal asks them to sign up. */
export const useSignedIn = () => Boolean(useSession().data);

/** Where to go after signing in: the page that asked, if it's one of ours. */
export function nextPath(search: string) {
  const next = new URLSearchParams(search).get("next");
  return next?.startsWith("/") && !next.startsWith("//") ? next : "/";
}

/** `?next=` pointing back at the current page, for sign-in and sign-up links. */
export function useNextParam() {
  const { pathname, search } = useLocation();
  return pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
}

/** Send a signed-out visitor to create an account, then bring them back here. */
export function useSignUpPrompt() {
  const navigate = useNavigate();
  const next = useNextParam();
  return () => navigate(`/sign-up${next}`);
}
