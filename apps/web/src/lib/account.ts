import { Home, Settings, UserRound, type LucideIcon } from "lucide-react";

export type AccountLink = { href: string; label: string; icon: LucideIcon };

/** Where a signed-in person can go. Someone without a handle has no public profile yet. */
export const accountLinks = (handle: string | null): AccountLink[] => [
  { href: "/", label: "Your tables", icon: Home },
  ...(handle ? [{ href: `/${handle}`, label: "Public profile", icon: UserRound }] : []),
  { href: "/settings", label: "Settings", icon: Settings },
];
