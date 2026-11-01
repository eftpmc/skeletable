import { Home, Settings, UserRound, Users, type LucideIcon } from "lucide-react";
import type { Me, Team } from "@/lib/api";

export type AccountLink = { href: string; label: string; icon: LucideIcon };

/** Whether this person can decide who sees an account's tables. */
export const ownsAccount = (user: Me["user"], owner: string) => !!user && (user.handle === owner || user.teams.some((team) => team.handle === owner && team.role === "owner"));

/** Sign in, and come back to the page you're on. */
export const signInHref = () => `/auth/google?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`;

/** Where a signed-in person can go. Someone without a handle has no public profile yet. */
export const accountLinks = (handle: string | null, teams: Team[] = [], invites = 0): AccountLink[] => [
  { href: "/", label: "Tables", icon: Home },
  ...(handle ? [{ href: `/${handle}`, label: "Public profile", icon: UserRound }] : []),
  ...teams.map((team) => ({ href: `/${team.handle}`, label: team.name, icon: Users })),
  { href: "/settings/teams", label: invites ? `Teams (${invites} ${invites === 1 ? "invite" : "invites"})` : "Teams", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
];
